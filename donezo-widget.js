// ╔══════════════════════════════════════════════════════════╗
// ║  Donezo — iOS home-screen widget (Scriptable)              ║
// ║  Shows your upcoming open tasks. Read-only. Tap to open.   ║
// ╚══════════════════════════════════════════════════════════╝
//
// SETUP:
//   1. Install "Scriptable" from the App Store (free).
//   2. Open Scriptable → tap + → paste this whole file → name it "Donezo".
//   3. Home screen → long-press empty space → + (top-left) → Scriptable →
//      pick a size → Add Widget.
//   4. Long-press the new widget → Edit Widget → Script → "Donezo".
//   5. If it shows "Can't reach Donezo": Settings → Scriptable → Local Network → ON,
//      and make sure your phone is on the same network as the server.
//
//   When you move Donezo to Unraid, just change BASE_URL below.

const BASE_URL = "http://10.0.0.55:4173";
const MAX_BY_SIZE = { small: 3, medium: 4, large: 9, extraLarge: 9 };

// ── theme: Donezo's "daily ledger" palette ──
const PAPER = new Color("#ecdfc6");
const INK = new Color("#251a12");
const INK2 = new Color("#6f5d46");
const FLAG = new Color("#df3f29"); // vermilion
const GRASS = new Color("#2f7a48");
const GOLD = new Color("#a8760f");
const BLUE = new Color("#2748b8");

const family = config.widgetFamily || "medium";
const maxTasks = MAX_BY_SIZE[family] || 4;

const widget = new ListWidget();
widget.backgroundColor = PAPER;
widget.setPadding(14, 16, 14, 16);
widget.url = BASE_URL; // tapping the widget opens Donezo
widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

try {
  const data = await new Request(`${BASE_URL}/api/tasks`).loadJSON();
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];
  const open = tasks.filter((t) => !t.completed);
  const todayKey = ymdLocal(new Date());

  // Due today (or overdue). If nothing's due, fall back to the next upcoming.
  const dueNow = open.filter((t) => t.dueDate && t.dueDate <= todayKey).sort(byDue);
  let toShow;
  let badge;
  if (dueNow.length) {
    toShow = dueNow;
    badge = { text: `${dueNow.length} due`, color: FLAG };
  } else {
    const upcoming = open.filter((t) => t.dueDate && t.dueDate > todayKey).sort(byDue);
    const nextDate = upcoming.length ? upcoming[0].dueDate : null;
    toShow = nextDate ? upcoming.filter((t) => t.dueDate === nextDate) : [];
    badge = toShow.length ? { text: "next up", color: INK2 } : null;
  }

  header(badge);
  widget.addSpacer(8);

  if (toShow.length === 0) {
    muted(open.length ? `Nothing due · ${open.length} open` : "All clear.");
  } else {
    for (const t of toShow.slice(0, maxTasks)) taskRow(t);
    const extra = toShow.length - maxTasks;
    if (extra > 0) {
      widget.addSpacer(3);
      muted(`+${extra} more`);
    }
  }
} catch (error) {
  header(null);
  widget.addSpacer(8);
  muted("Can't reach Donezo");
}

if (config.runsInWidget) Script.setWidget(widget);
else if (family === "small") widget.presentSmall();
else if (family === "large") widget.presentLarge();
else widget.presentMedium();
Script.complete();

// ── builders ─────────────────────────────────────────────
function header(badge) {
  const row = widget.addStack();
  row.centerAlignContent();

  const now = new Date();
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dateLabel = `${weekdays[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`;

  const title = row.addText(dateLabel);
  title.font = new Font("Georgia-BoldItalic", 17);
  title.textColor = INK;
  title.lineLimit = 1;
  title.minimumScaleFactor = 0.6;

  row.addSpacer();

  if (badge) {
    const c = row.addText(badge.text);
    c.font = new Font("Menlo", 11);
    c.textColor = badge.color;
  }

  widget.addSpacer(5);
  const rule = widget.addStack();
  rule.size = new Size(40, 3);
  rule.cornerRadius = 1.5;
  rule.backgroundColor = FLAG;
}

function taskRow(t) {
  const row = widget.addStack();
  row.centerAlignContent();
  row.spacing = 6;

  const dot = row.addText("•");
  dot.font = Font.boldSystemFont(13);
  dot.textColor = INK2;

  const title = row.addText(String(t.title || ""));
  title.font = Font.mediumSystemFont(13);
  title.textColor = INK;
  title.lineLimit = 1;

  row.addSpacer();

  const due = describeDue(t.dueDate);
  if (due) {
    const chip = row.addText(due.label);
    chip.font = new Font("Menlo", 10);
    chip.textColor = due.color;
  }
  widget.addSpacer(6);
}

function muted(text) {
  const t = widget.addText(text);
  t.font = Font.systemFont(12);
  t.textColor = INK2;
}

// ── ordering + dates ─────────────────────────────────────
function byDue(a, b) {
  return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
}

function ymdLocal(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function describeDue(dueDate) {
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return null;
  const [y, m, d] = dueDate.split("-").map(Number);
  const due = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((due - today) / 86400000);

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  if (diff < 0) return { label: diff === -1 ? "yesterday" : `${-diff}d late`, color: FLAG };
  if (diff === 0) return { label: "today", color: GRASS };
  if (diff === 1) return { label: "tomorrow", color: GOLD };
  if (diff < 7) return { label: days[due.getDay()].toLowerCase(), color: BLUE };
  return { label: `${months[due.getMonth()]} ${due.getDate()}`, color: INK2 };
}
