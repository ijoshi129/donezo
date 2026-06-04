"use strict";

/**
 * web-push.js — dependency-free Web Push (VAPID + aes128gcm), per RFC 8291/8292.
 * Uses only Node's crypto. Lets the server send push notifications to subscribed
 * browsers / installed PWAs (iOS 16.4+).
 */

const crypto = require("node:crypto");

const b64u = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (str) => Buffer.from(String(str).replace(/-/g, "+").replace(/_/g, "/"), "base64");

// Generate a VAPID keypair: public = uncompressed P-256 point (65B), private = raw scalar (32B).
function generateVapidKeys() {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
}

function vapidPrivateKeyObject(privateKeyB64u, publicKeyB64u) {
  const pub = fromB64u(publicKeyB64u); // 0x04 || X(32) || Y(32)
  return crypto.createPrivateKey({
    format: "jwk",
    key: {
      kty: "EC",
      crv: "P-256",
      d: privateKeyB64u,
      x: b64u(pub.subarray(1, 33)),
      y: b64u(pub.subarray(33, 65)),
    },
  });
}

// Signed VAPID JWT (ES256) authorizing a push to `audience` (the endpoint origin).
function vapidJwt(audience, subject, keys) {
  const header = b64u(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64u(
    Buffer.from(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: subject,
      }),
    ),
  );
  const signingInput = `${header}.${payload}`;
  const keyObj = vapidPrivateKeyObject(keys.privateKey, keys.publicKey);
  const sig = crypto.sign("sha256", Buffer.from(signingInput), {
    key: keyObj,
    dsaEncoding: "ieee-p1363", // raw r||s, the JOSE format
  });
  return `${signingInput}.${b64u(sig)}`;
}

// Encrypt a payload for a subscription, producing an aes128gcm body (RFC 8291 + 8188).
function encrypt(payload, p256dhB64u, authB64u) {
  const clientPub = fromB64u(p256dhB64u); // 65B
  const authSecret = fromB64u(authB64u); // 16B

  const server = crypto.createECDH("prime256v1");
  server.generateKeys();
  const serverPub = server.getPublicKey(); // 65B
  const sharedSecret = server.computeSecret(clientPub); // 32B

  const salt = crypto.randomBytes(16);

  // RFC 8291: IKM = HKDF(salt=auth, ikm=ecdh, info="WebPush: info\0"||clientPub||serverPub)
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), clientPub, serverPub]);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", sharedSecret, authSecret, keyInfo, 32));

  // RFC 8188: CEK and nonce from the message salt
  const cek = Buffer.from(
    crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16),
  );
  const nonce = Buffer.from(
    crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12),
  );

  // single record: plaintext || 0x02 delimiter, then AES-128-GCM
  const plaintext = Buffer.concat([Buffer.from(payload, "utf8"), Buffer.from([0x02])]);
  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

  // header: salt(16) || rs(4=4096) || idlen(1) || serverPub(65)
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096, 0);
  return Buffer.concat([salt, rs, Buffer.from([serverPub.length]), serverPub, ciphertext]);
}

// Decrypt an aes128gcm body (used only for self-tests).
function decrypt(body, receiverPrivateKeyObject, authB64u) {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const serverPub = body.subarray(21, 21 + idlen);
  const ciphertext = body.subarray(21 + idlen);
  const authSecret = fromB64u(authB64u);

  const receiverPub = crypto
    .createPublicKey(receiverPrivateKeyObject)
    .export({ format: "jwk" });
  const clientPub = Buffer.concat([
    Buffer.from([0x04]),
    fromB64u(receiverPub.x),
    fromB64u(receiverPub.y),
  ]);

  const sharedSecret = crypto.diffieHellman({
    privateKey: receiverPrivateKeyObject,
    publicKey: crypto.createPublicKey({
      format: "jwk",
      key: jwkFromPoint(serverPub),
    }),
  });

  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), clientPub, serverPub]);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", sharedSecret, authSecret, keyInfo, 32));
  const cek = Buffer.from(
    crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16),
  );
  const nonce = Buffer.from(
    crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12),
  );

  const tag = ciphertext.subarray(ciphertext.length - 16);
  const enc = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(enc), decipher.final()]);
  return out.subarray(0, out.length - 1).toString("utf8"); // strip 0x02 delimiter
}

function jwkFromPoint(point) {
  return {
    kty: "EC",
    crv: "P-256",
    x: b64u(point.subarray(1, 33)),
    y: b64u(point.subarray(33, 65)),
  };
}

// Send a push. Returns the HTTP status (201 ok; 404/410 = subscription gone).
async function sendNotification(subscription, payload, keys, subject) {
  const endpoint = subscription.endpoint;
  const url = new URL(endpoint);
  const jwt = vapidJwt(`${url.protocol}//${url.host}`, subject, keys);
  const body = encrypt(payload, subscription.keys.p256dh, subscription.keys.auth);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      TTL: "86400",
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      Authorization: `vapid t=${jwt}, k=${keys.publicKey}`,
    },
    body,
    signal: AbortSignal.timeout(15000),
  });
  return response.status;
}

module.exports = {
  generateVapidKeys,
  vapidJwt,
  encrypt,
  decrypt,
  sendNotification,
  b64u,
  fromB64u,
};
