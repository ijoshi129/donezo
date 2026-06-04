"use strict";

/**
 * mac-reminders-sync.js — watch a macOS Reminders list and import new reminders
 * into Donezo, near-instantly. macOS only. Uses AppleScript (osascript), so it
 * sees iCloud reminders that CalDAV can't.
 *
 * Enable by running the server on the Mac with:
 *   MAC_REMINDERS_LIST="Donezo"          # the Reminders list to watch
 *   MAC_REMINDERS_POLL_SECONDS="15"      # optional, default 15
 *   MAC_REMINDERS_AFTER="complete"       # complete | delete (default complete)
 *
 * First run will trigger a one-time macOS prompt to allow controlling Reminders.
 * Inert unless MAC_REMINDERS_LIST is set and the platform is macOS.
 */

const { execFile } = require("node:child_process");

function escapeForAppleScript(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function readScript(listName) {
  const list = escapeForAppleScript(listName);
  return [
    'tell application "Reminders"',
    `  set theList to list "${list}"`,
    "  set outLines to {}",
    "  repeat with r in (reminders of theList whose completed is false)",
    "    set rid to id of r",
    "    set rname to name of r",
    '    set rdue to ""',
    "    set d to missing value",
    "    try",
    "      set d to due date of r",
    "    end try",
    "    if d is not missing value then",
    '      set m to text -2 thru -1 of ("0" & ((month of d) as integer))',
    '      set dd to text -2 thru -1 of ("0" & (day of d))',
    '      set rdue to ((year of d) as string) & "-" & m & "-" & dd',
    "    end if",
    "    set end of outLines to rid & tab & rname & tab & rdue",
    "  end repeat",
    "  set AppleScript's text item delimiters to linefeed",
    "  return outLines as string",
    "end tell",
  ].join("\n");
}

function finishScript(listName, ids, mode) {
  const list = escapeForAppleScript(listName);
  const idList = ids.map((id) => `"${escapeForAppleScript(id)}"`).join(", ");
  const action = mode === "delete" ? "delete r" : "set completed of r to true";
  return [
    `set theIds to {${idList}}`,
    'tell application "Reminders"',
    "  repeat with theId in theIds",
    "    try",
    `      set r to (first reminder of list "${list}" whose id is (theId as string))`,
    `      ${action}`,
    "    end try",
    "  end repeat",
    "end tell",
  ].join("\n");
}

function runOsascript(script) {
  return new Promise((resolve, reject) => {
    execFile(
      "osascript",
      ["-e", script],
      { timeout: 25000, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error((stderr || error.message || "osascript failed").trim()));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

function startMacRemindersSync({ store, saveStore, importTask, log = console.log }) {
  const listName = process.env.MAC_REMINDERS_LIST;
  if (!listName) return null; // not configured

  if (process.platform !== "darwin") {
    log("[mac-reminders] MAC_REMINDERS_LIST is set but this isn't macOS — skipping.");
    return null;
  }

  const pollSeconds = Math.max(5, Number(process.env.MAC_REMINDERS_POLL_SECONDS) || 15);
  const mode = process.env.MAC_REMINDERS_AFTER === "delete" ? "delete" : "complete";
  const seen = new Set(); // ids handled this session (guards against a failed finish step)
  let stopped = false;
  let timer = null;

  async function pollOnce() {
    const out = await runOsascript(readScript(listName));
    const imported = [];
    for (const line of out.split("\n")) {
      const row = line.replace(/\r$/, "");
      if (!row) continue;
      const tab = row.indexOf("\t");
      if (tab === -1) continue;
      const id = row.slice(0, tab);
      const rest = row.slice(tab + 1);
      const tab2 = rest.indexOf("\t");
      const title = (tab2 === -1 ? rest : rest.slice(0, tab2)).trim();
      const dueDate = tab2 === -1 ? "" : rest.slice(tab2 + 1).trim();
      if (!title || seen.has(id)) continue;
      importTask({ title, dueDate: dueDate || null });
      seen.add(id);
      imported.push(id);
    }

    if (imported.length) {
      await saveStore();
      try {
        await runOsascript(finishScript(listName, imported, mode));
      } catch (error) {
        log(`[mac-reminders] could not ${mode} reminders after import: ${error.message}`);
      }
      log(`[mac-reminders] imported ${imported.length} reminder(s) from "${listName}"`);
    }
  }

  async function loop() {
    if (stopped) return;
    try {
      await pollOnce();
    } catch (error) {
      log(`[mac-reminders] sync error: ${error.message}`);
    }
    if (!stopped) timer = setTimeout(loop, pollSeconds * 1000);
  }

  log(
    `[mac-reminders] watching Reminders list "${listName}" every ${pollSeconds}s ` +
      `(after import: ${mode})`,
  );
  loop();

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}

module.exports = { startMacRemindersSync, readScript, finishScript };
