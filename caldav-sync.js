"use strict";

/**
 * caldav-sync.js — one-way sync of Apple Reminders -> Donezo over iCloud CalDAV.
 *
 * Zero dependencies (uses Node's global fetch / Buffer / URL). Completely
 * inert unless configured via environment variables, so it never affects the
 * app when it's off.
 *
 * Setup:
 *   1. Make a Reminders list named "Donezo" (and set it as your default list so
 *      "Hey Siri, remind me to ..." lands there).
 *   2. Create an app-specific password at account.apple.com (Sign-In & Security
 *      -> App-Specific Passwords).
 *   3. Run the server with:
 *        ICLOUD_USER="you@icloud.com"
 *        ICLOUD_APP_PASSWORD="abcd-efgh-ijkl-mnop"
 *        ICLOUD_LIST="Donezo"              # optional, default "Donezo"
 *        ICLOUD_POLL_SECONDS="60"          # optional, default 60
 *        ICLOUD_AFTER_IMPORT="keep"        # keep | complete | delete (default keep)
 *
 * "keep" never writes to iCloud (safest). "complete" checks the reminder off in
 * Apple Reminders after importing; "delete" removes it. Either way, a reminder
 * is imported into Donezo exactly once (tracked by its UID).
 */

const CALDAV_ROOT = "https://caldav.icloud.com";
const REQUEST_TIMEOUT_MS = 30000;

// ---- pure parsing helpers (exported for tests) ----

// Pull out each <response>...</response> block, namespace-prefix agnostic.
function extractResponses(xml) {
  const blocks = [];
  const re = /<(?:\w+:)?response[\s>][\s\S]*?<\/(?:\w+:)?response>/gi;
  const matches = xml.match(re) || [];
  for (const m of matches) blocks.push(m);
  return blocks;
}

function firstHref(xml) {
  const m = xml.match(/<(?:\w+:)?href[^>]*>([^<]+)<\/(?:\w+:)?href>/i);
  return m ? m[1].trim() : null;
}

function innerOf(xml, tag) {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, "i"));
  return m ? m[1] : null;
}

function principalHref(xml) {
  const inner = innerOf(xml, "current-user-principal");
  return inner ? firstHref(inner) : null;
}

function calendarHomeHref(xml) {
  const inner = innerOf(xml, "calendar-home-set");
  return inner ? firstHref(inner) : null;
}

// From a Depth:1 PROPFIND of the calendar-home, find the collection whose
// displayname matches `listName` and which supports VTODO (a Reminders list).
function findCalendarHref(xml, listName) {
  const wanted = String(listName).trim().toLowerCase();
  const names = [];
  const todoNames = [];
  for (const block of extractResponses(xml)) {
    const href = firstHref(block);
    const name = (innerOf(block, "displayname") || "").trim();
    const supportsTodo = /comp\s+name="VTODO"/i.test(block);
    if (name) names.push(name);
    if (name && supportsTodo) todoNames.push(name);
    if (href && supportsTodo && name.toLowerCase() === wanted) {
      return { href, names, todoNames };
    }
  }
  return { href: null, names, todoNames };
}

function unescapeXml(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#0?13;/g, "\r")
    .replace(/&#0?10;/g, "\n")
    .replace(/&amp;/g, "&");
}

// Parse a REPORT multistatus into [{ uid, title, dueDate, completed, href, etag, ics }]
function parseTodoResponses(xml) {
  const items = [];
  for (const block of extractResponses(xml)) {
    const dataInner = innerOf(block, "calendar-data");
    if (!dataInner) continue;
    const ics = unescapeXml(dataInner.trim());
    const todo = parseVtodo(ics);
    if (!todo || !todo.uid) continue;
    items.push({
      ...todo,
      ics,
      href: firstHref(block),
      etag: (innerOf(block, "getetag") || "").trim() || null,
    });
  }
  return items;
}

// RFC 5545 line unfolding: a CRLF/LF followed by a space or tab continues the line.
function unfoldIcs(ics) {
  return ics.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
}

function unescapeIcalText(s) {
  return s
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function icalProp(body, name) {
  const re = new RegExp(`^${name}(?:;[^:\\r\\n]*)?:(.*)$`, "im");
  const m = body.match(re);
  return m ? m[1].trim() : null;
}

function icalDateToDue(raw) {
  if (!raw) return null;
  const m = raw.match(/(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function parseVtodo(ics) {
  const text = unfoldIcs(ics);
  const block = text.match(/BEGIN:VTODO([\s\S]*?)END:VTODO/i);
  if (!block) return null;
  const body = block[1];
  const status = (icalProp(body, "STATUS") || "").toUpperCase();
  const completed =
    Boolean(icalProp(body, "COMPLETED")) ||
    status === "COMPLETED" ||
    status === "CANCELLED" ||
    icalProp(body, "PERCENT-COMPLETE") === "100";
  return {
    uid: icalProp(body, "UID"),
    title: unescapeIcalText(icalProp(body, "SUMMARY") || ""),
    dueDate: icalDateToDue(icalProp(body, "DUE")),
    completed,
  };
}

// Rewrite a VTODO's ics so the reminder is marked completed in iCloud.
function markCompletedIcs(ics, stamp) {
  let body = ics
    .replace(/^STATUS:.*$\r?\n?/im, "")
    .replace(/^COMPLETED:.*$\r?\n?/im, "")
    .replace(/^PERCENT-COMPLETE:.*$\r?\n?/im, "");
  const inject = `STATUS:COMPLETED\r\nPERCENT-COMPLETE:100\r\nCOMPLETED:${stamp}\r\n`;
  return body.replace(/END:VTODO/i, inject + "END:VTODO");
}

// ---- the runtime poller ----

function startCaldavSync({ store, saveStore, importTask, log = console.log }) {
  const user = process.env.ICLOUD_USER;
  const pass = process.env.ICLOUD_APP_PASSWORD;
  if (!user || !pass) return null; // not configured — stay completely off

  const listName = process.env.ICLOUD_LIST || "Donezo";
  const pollSeconds = Math.max(15, Number(process.env.ICLOUD_POLL_SECONDS) || 60);
  const afterImport = ["keep", "complete", "delete"].includes(process.env.ICLOUD_AFTER_IMPORT)
    ? process.env.ICLOUD_AFTER_IMPORT
    : "keep";

  const authHeader = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
  let calendarUrl = null;
  let stopped = false;
  let timer = null;

  async function dav(method, url, { depth, body, contentType, ifMatch } = {}) {
    const headers = { Authorization: authHeader };
    if (contentType) headers["Content-Type"] = contentType;
    else if (body) headers["Content-Type"] = "application/xml; charset=utf-8";
    if (depth !== undefined) headers.Depth = String(depth);
    if (ifMatch) headers["If-Match"] = ifMatch;

    const res = await fetch(url, {
      method,
      headers,
      body,
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await res.text();
    if (res.status === 401) {
      throw new Error("iCloud rejected the login (check ICLOUD_USER and the app-specific password)");
    }
    if (res.status >= 400) {
      throw new Error(`${method} ${url} -> HTTP ${res.status}`);
    }
    return { status: res.status, text, url: res.url || url };
  }

  const PRINCIPAL_BODY =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>';
  const HOME_BODY =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">' +
    "<d:prop><c:calendar-home-set/></d:prop></d:propfind>";
  const LIST_BODY =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">' +
    "<d:prop><d:displayname/><c:supported-calendar-component-set/></d:prop></d:propfind>";
  const QUERY_BODY =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">' +
    "<d:prop><d:getetag/><c:calendar-data/></d:prop>" +
    '<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VTODO"/></c:comp-filter></c:filter>' +
    "</c:calendar-query>";

  async function discover() {
    const root = await dav("PROPFIND", CALDAV_ROOT + "/", { depth: 0, body: PRINCIPAL_BODY });
    const pHref = principalHref(root.text);
    if (!pHref) throw new Error("could not find the iCloud principal");
    const principalUrl = new URL(pHref, root.url).href;

    const home = await dav("PROPFIND", principalUrl, { depth: 0, body: HOME_BODY });
    const hHref = calendarHomeHref(home.text);
    if (!hHref) throw new Error("could not find the calendar home");
    const homeUrl = new URL(hHref, principalUrl).href;

    const list = await dav("PROPFIND", homeUrl, { depth: 1, body: LIST_BODY });
    const { href, todoNames } = findCalendarHref(list.text, listName);
    if (!href) {
      throw new Error(
        `Reminders list "${listName}" not found. Reminders (VTODO) lists visible over CalDAV: ` +
          `${todoNames.join(", ") || "(none — iCloud is not exposing any reminders lists)"}`,
      );
    }
    return new URL(href, homeUrl).href;
  }

  function icsTimestamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return (
      `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T` +
      `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
    );
  }

  async function writeBack(item) {
    if (afterImport === "keep" || !item.href || !item.etag) return;
    const itemUrl = new URL(item.href, calendarUrl).href;
    try {
      if (afterImport === "delete") {
        await dav("DELETE", itemUrl, { ifMatch: item.etag });
      } else {
        await dav("PUT", itemUrl, {
          ifMatch: item.etag,
          contentType: "text/calendar; charset=utf-8",
          body: markCompletedIcs(item.ics, icsTimestamp()),
        });
      }
    } catch (error) {
      log(`[caldav] could not ${afterImport} reminder after import: ${error.message}`);
    }
  }

  async function pollOnce() {
    if (!calendarUrl) {
      calendarUrl = await discover();
      log(`[caldav] connected to list "${listName}"`);
    }

    const report = await dav("REPORT", calendarUrl, { depth: 1, body: QUERY_BODY });
    const items = parseTodoResponses(report.text);
    const incomplete = items.filter((item) => !item.completed && item.title);

    const seen = new Set(Array.isArray(store.importedUids) ? store.importedUids : []);
    const stillPending = new Set(incomplete.map((item) => item.uid));
    let imported = 0;

    for (const item of incomplete) {
      if (seen.has(item.uid)) continue;
      importTask({ title: item.title, dueDate: item.dueDate });
      seen.add(item.uid);
      imported += 1;
      log(`[caldav] imported reminder: "${item.title}"`);
      await writeBack(item);
    }

    // Keep the seen-list bounded: forget UIDs that are no longer pending.
    const pruned = [...seen].filter((uid) => stillPending.has(uid) || imported);
    const next = imported ? pruned : [...seen].filter((uid) => stillPending.has(uid));
    const prev = Array.isArray(store.importedUids) ? store.importedUids : [];
    if (imported || next.length !== prev.length) {
      store.importedUids = next;
      await saveStore();
    }
  }

  async function loop() {
    if (stopped) return;
    try {
      await pollOnce();
    } catch (error) {
      log(`[caldav] sync error: ${error.message}`);
      // A bad discovery result shouldn't be cached — retry it next cycle.
      if (/principal|calendar home|not found|HTTP 4/.test(error.message)) calendarUrl = null;
    }
    if (!stopped) timer = setTimeout(loop, pollSeconds * 1000);
  }

  log(
    `[caldav] Apple Reminders sync enabled (list "${listName}", every ${pollSeconds}s, ` +
      `after-import: ${afterImport})`,
  );
  loop();

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}

module.exports = {
  startCaldavSync,
  // exported for tests
  extractResponses,
  principalHref,
  calendarHomeHref,
  findCalendarHref,
  parseTodoResponses,
  parseVtodo,
  markCompletedIcs,
  unescapeXml,
};
