"use strict";

/**
 * mac-reminders-bridge.js — run this ON YOUR MAC (not in Docker).
 *
 * Reads a macOS Reminders list via AppleScript and POSTs new reminders to a
 * remote Donezo server (e.g. one running in Docker on a Linux box). This gives
 * you instant "Hey Siri, remind me to X" capture even though the server itself
 * can't read Reminders.
 *
 * Run on the Mac:
 *   DONEZO_URL="http://192.168.1.83:4173" MAC_REMINDERS_LIST="Donezo" node mac-reminders-bridge.js
 *
 * Or put those in a .env next to this file and just run `node mac-reminders-bridge.js`.
 *
 * Env:
 *   DONEZO_URL                 (required) base URL of the Donezo server
 *   MAC_REMINDERS_LIST         (required) the Reminders list to watch
 *   MAC_REMINDERS_POLL_SECONDS (default 15)
 *   MAC_REMINDERS_AFTER        complete | delete (default complete)
 *
 * A reminder is only checked off once the server confirms it was created, so if
 * the server is unreachable nothing is lost — it retries next poll.
 */

const path = require("node:path");
const {
  readScript,
  finishScript,
  runOsascript,
  parseReminderLines,
} = require("./mac-reminders-sync");

loadLocalEnv();

if (process.platform !== "darwin") {
  console.error("[bridge] This must run on macOS (it reads Reminders via AppleScript).");
  process.exit(1);
}

const baseUrl = (process.env.DONEZO_URL || "").replace(/\/+$/, "");
const listName = process.env.MAC_REMINDERS_LIST;
const pollSeconds = Math.max(5, Number(process.env.MAC_REMINDERS_POLL_SECONDS) || 15);
const mode = process.env.MAC_REMINDERS_AFTER === "delete" ? "delete" : "complete";

if (!baseUrl || !listName) {
  console.error(
    "[bridge] Set DONEZO_URL and MAC_REMINDERS_LIST.\n" +
      '  e.g. DONEZO_URL="http://192.168.1.83:4173" MAC_REMINDERS_LIST="Donezo" node mac-reminders-bridge.js',
  );
  process.exit(1);
}

const seen = new Set();

async function postTask(item) {
  const response = await fetch(`${baseUrl}/api/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: item.title, dueDate: item.dueDate }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

async function pollOnce() {
  const out = await runOsascript(readScript(listName));
  const items = parseReminderLines(out);
  const done = [];

  for (const item of items) {
    if (seen.has(item.id)) continue;
    try {
      await postTask(item);
    } catch (error) {
      // Server unreachable/erroring — leave the reminder, retry next poll.
      console.log(`[bridge] could not reach Donezo (${error.message}); will retry`);
      break;
    }
    seen.add(item.id);
    done.push(item.id);
    console.log(`[bridge] sent: "${item.title}"`);
  }

  if (done.length) {
    try {
      await runOsascript(finishScript(listName, done, mode));
    } catch (error) {
      console.log(`[bridge] could not ${mode} reminders after sending: ${error.message}`);
    }
  }
}

let stopped = false;
async function loop() {
  if (stopped) return;
  try {
    await pollOnce();
  } catch (error) {
    console.log(`[bridge] error: ${error.message}`);
  }
  if (!stopped) setTimeout(loop, pollSeconds * 1000);
}

process.on("SIGINT", () => {
  stopped = true;
  console.log("\n[bridge] stopped.");
  process.exit(0);
});

console.log(
  `[bridge] watching Reminders "${listName}" every ${pollSeconds}s → ${baseUrl} (after: ${mode})`,
);
loop();

// Minimal .env loader (same behavior as the server's), so DONEZO_URL etc. can
// live in a local .env. Real environment variables take precedence.
function loadLocalEnv() {
  let raw;
  try {
    raw = require("node:fs").readFileSync(path.join(__dirname, ".env"), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value[0] === '"' && value.at(-1) === '"') || (value[0] === "'" && value.at(-1) === "'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) process.env[key] = value;
  }
}
