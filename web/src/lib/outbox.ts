import { ApiError, api } from "../api";
import type { Task } from "../types";

// A durable, ordered queue of pending writes. Changes apply optimistically via
// applyOps() (overlaid on the server snapshot) and persist in localStorage, so
// they survive reloads and being offline. The queue replays whenever we get a
// chance (timer / focus / reconnect); creates are idempotent (clientId) so
// retries on a flaky network never duplicate or lose a task.

export type Op =
  | { id: string; kind: "create"; task: Task; notBefore: number; attempts?: number }
  | { id: string; kind: "update"; taskId: string; patch: Partial<Task>; notBefore: number; attempts?: number }
  | { id: string; kind: "delete"; taskId: string; notBefore: number; attempts?: number };

const KEY = "donezo:outbox";
let ops: Op[] = loadOps();
const idMap = new Map<string, string>(); // tempId -> realId (this session)
const subs = new Set<() => void>();
let syncing = false;
let holdTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;
let onDrained: (() => void) | null = null;
let reconcileCreate: ((tempId: string, real: Task) => void) | null = null;

function loadOps(): Op[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function setOps(next: Op[]) {
  ops = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(ops));
  } catch {
    /* quota — ignore */
  }
  for (const s of subs) s();
  scheduleHold();
}
const uid = () => crypto.randomUUID();
const taskIdOf = (op: Op) => (op.kind === "create" ? op.task.id : op.taskId);
const realId = (id: string) => idMap.get(id) ?? id;

// Re-try once a held (undo-window) op becomes due.
function scheduleHold() {
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
  const now = Date.now();
  const due = ops.map((o) => o.notBefore).filter((t) => t > now);
  if (due.length) holdTimer = setTimeout(() => void sync(), Math.max(50, Math.min(...due) - now));
}

// First op past its hold time, not blocked by an earlier not-ready op for the
// SAME task (keeps per-task causal order without one held op stalling others).
function nextReady(): Op | null {
  const now = Date.now();
  const blocked = new Set<string>();
  for (const op of ops) {
    const tid = taskIdOf(op);
    if (op.notBefore > now) {
      blocked.add(tid);
      continue;
    }
    if (blocked.has(tid)) continue;
    return op;
  }
  return null;
}

async function runOp(op: Op): Promise<"ok" | "retry" | "drop"> {
  try {
    if (op.kind === "create") {
      const real = await api.createTask({
        clientId: op.task.id, // idempotency key
        title: op.task.title,
        notes: op.task.notes,
        image: op.task.image,
        tags: op.task.tags,
        priority: op.task.priority,
        pinned: op.task.pinned,
        listId: op.task.listId,
      });
      idMap.set(op.task.id, real.id);
      reconcileCreate?.(op.task.id, real);
    } else if (op.kind === "update") {
      await api.updateTask(realId(op.taskId), op.patch);
    } else {
      await api.deleteTask(realId(op.taskId));
    }
    return "ok";
  } catch (err) {
    const status = err instanceof ApiError ? err.status : undefined;
    // No status => the request never reached the server (offline / network).
    // Retry forever; never count it against the op, so nothing is lost offline.
    if (status === undefined) return "retry";
    // Target already gone — the change is effectively applied.
    if (status === 404 || status === 410) return "drop";
    // The server actively rejected it. Retry a few times (transient 5xx), then
    // give up so one poison op can't block the queue forever.
    op.attempts = (op.attempts ?? 0) + 1;
    return op.attempts > 8 ? "drop" : "retry";
  }
}

async function sync() {
  if (syncing) return;
  syncing = true;
  try {
    let op: Op | null;
    while ((op = nextReady())) {
      const result = await runOp(op);
      if (result === "retry") break; // try again on the next trigger
      const id = op.id;
      setOps(ops.filter((o) => o.id !== id)); // remove on ok or drop
    }
  } finally {
    syncing = false;
  }
  if (ops.length === 0) onDrained?.();
  else scheduleHold();
}

export const outbox = {
  subscribe(cb: () => void) {
    subs.add(cb);
    return () => {
      subs.delete(cb);
    };
  },
  getOps: () => ops,
  pendingCount: () => ops.filter((o) => o.kind).length,

  // Wire reconcile callbacks and start the replay triggers. Call once, after
  // configuring, so a replay never runs before the callbacks exist.
  start(opts: {
    onDrained?: () => void;
    reconcileCreate?: (tempId: string, real: Task) => void;
  }) {
    onDrained = opts.onDrained ?? null;
    reconcileCreate = opts.reconcileCreate ?? null;
    if (started) {
      void sync();
      return;
    }
    started = true;
    const kick = () => void sync();
    window.addEventListener("online", kick);
    window.addEventListener("focus", kick);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") kick();
    });
    // Periodic safety net (cheap; only does work when something is queued).
    setInterval(() => {
      if (ops.length) void sync();
    }, 12000);
    void sync();
  },

  createTask(task: Task) {
    setOps([...ops, { id: uid(), kind: "create", task, notBefore: 0 }]);
    void sync();
  },
  updateTask(taskId: string, patch: Partial<Task>, delayMs = 0): string {
    const id = uid();
    setOps([...ops, { id, kind: "update", taskId, patch, notBefore: Date.now() + delayMs }]);
    if (!delayMs) void sync();
    return id;
  },
  // Returns the op id (for undo), or null if it cancelled a still-pending
  // offline create (net no-op — nothing to undo on the server).
  deleteTask(taskId: string, delayMs = 0): string | null {
    if (ops.some((o) => o.kind === "create" && o.task.id === taskId)) {
      setOps(ops.filter((o) => taskIdOf(o) !== taskId));
      return null;
    }
    const id = uid();
    setOps([...ops, { id, kind: "delete", taskId, notBefore: Date.now() + delayMs }]);
    if (!delayMs) void sync();
    return id;
  },
  cancel(opId: string) {
    setOps(ops.filter((o) => o.id !== opId));
  },
};

// Overlay the pending ops on top of a server snapshot. Idempotent, so it's safe
// even when the server already reflects an op still in the queue.
export function applyOps(base: Task[], current: Op[]): Task[] {
  let list = base;
  for (const op of current) {
    if (op.kind === "create") {
      if (!list.some((t) => t.id === op.task.id)) list = [op.task, ...list];
    } else if (op.kind === "update") {
      list = list.map((t) => (t.id === op.taskId ? { ...t, ...op.patch } : t));
    } else {
      list = list.filter((t) => t.id !== op.taskId);
    }
  }
  return list;
}
