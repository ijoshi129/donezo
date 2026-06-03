const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "tasks.json");
const IMAGE_DIR = path.join(DATA_DIR, "images");
const IMAGE_URL_PREFIX = "/api/images/";
const MAX_REQUEST_BYTES = 6_000_000;
const MAX_IMAGE_BYTES = 5_500_000;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

const DEFAULT_SETTINGS = {
  autoClearNoon: true,
};

let store = {
  lastNoonCleanup: null,
  settings: { ...DEFAULT_SETTINGS },
  tasks: [],
};
let writeQueue = Promise.resolve();

start().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function start() {
  await loadStore();
  await migrateLegacyImages();
  await clearCompletedAfterNoon();

  const server = http.createServer((request, response) => {
    route(request, response).catch((error) => {
      console.error(error);
      sendJson(response, 500, { error: "Internal server error" });
    });
  });

  server.listen(PORT, () => {
    console.log(`Donezo server running at http://127.0.0.1:${PORT}/`);
  });

  scheduleNextNoonCleanup();
}

async function route(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname.startsWith("/api/")) {
    await clearCompletedAfterNoon();
    await routeApi(request, response, url);
    return;
  }

  await serveStatic(response, url.pathname);
}

async function routeApi(request, response, url) {
  if (url.pathname === "/api/tasks" && request.method === "GET") {
    sendJson(response, 200, { tasks: sortTasks(store.tasks) });
    return;
  }

  if (url.pathname === "/api/settings" && request.method === "GET") {
    sendJson(response, 200, { settings: store.settings });
    return;
  }

  if (url.pathname === "/api/settings" && request.method === "PATCH") {
    const body = await readJson(request);
    if (typeof body.autoClearNoon === "boolean") {
      store.settings.autoClearNoon = body.autoClearNoon;
    }
    await saveStore();
    sendJson(response, 200, { settings: store.settings });
    return;
  }

  if (url.pathname === "/api/tasks/reorder" && request.method === "POST") {
    const body = await readJson(request);
    const ids = Array.isArray(body.ids) ? body.ids : [];
    const known = new Map(store.tasks.map((task) => [task.id, task]));
    let index = 0;
    for (const id of ids) {
      const task = known.get(id);
      if (task) task.order = index++;
    }
    await saveStore();
    sendJson(response, 200, { tasks: sortTasks(store.tasks) });
    return;
  }

  if (url.pathname === "/api/tasks" && request.method === "POST") {
    const body = await readJson(request);
    const title = String(body.title || "").trim();
    if (!title) {
      sendJson(response, 400, { error: "Task title is required" });
      return;
    }

    const task = {
      id: crypto.randomUUID(),
      title: title.slice(0, 140),
      image: await persistImage(body.image, null),
      dueDate: normalizeDueDate(body.dueDate),
      tags: normalizeTags(body.tags),
      recurrence: normalizeRecurrence(body.recurrence),
      completed: false,
      createdAt: Date.now(),
      completedAt: null,
    };
    store.tasks.push(task);
    await saveStore();
    sendJson(response, 201, { task });
    return;
  }

  const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (taskMatch && request.method === "PATCH") {
    const id = decodeURIComponent(taskMatch[1]);
    const task = store.tasks.find((item) => item.id === id);
    if (!task) {
      sendJson(response, 404, { error: "Task not found" });
      return;
    }

    const body = await readJson(request);
    const wasCompleted = task.completed;
    if (typeof body.completed === "boolean") {
      task.completed = body.completed;
      task.completedAt = body.completed ? Date.now() : null;
    }
    if (typeof body.title === "string") {
      task.title = body.title.trim().slice(0, 140) || task.title;
    }
    if (Object.hasOwn(body, "image")) {
      task.image = await persistImage(body.image, task.image);
    }
    if (Object.hasOwn(body, "dueDate")) {
      task.dueDate = normalizeDueDate(body.dueDate);
    }
    if (Object.hasOwn(body, "tags")) {
      task.tags = normalizeTags(body.tags);
    }
    if (Object.hasOwn(body, "recurrence")) {
      task.recurrence = normalizeRecurrence(body.recurrence);
    }

    // Completing a recurring task spawns its next occurrence.
    let spawned = null;
    if (!wasCompleted && task.completed && isRecurring(task.recurrence)) {
      spawned = {
        id: crypto.randomUUID(),
        title: task.title,
        image: await copyImageFile(task.image),
        dueDate: advanceDueDate(task.dueDate, task.recurrence),
        tags: [...(task.tags || [])],
        recurrence: task.recurrence,
        completed: false,
        createdAt: Date.now(),
        completedAt: null,
      };
      store.tasks.push(spawned);
    }

    await saveStore();
    sendJson(response, 200, { task, spawned });
    return;
  }

  if (taskMatch && request.method === "DELETE") {
    const id = decodeURIComponent(taskMatch[1]);
    const removed = store.tasks.find((task) => task.id === id);
    if (!removed) {
      sendJson(response, 404, { error: "Task not found" });
      return;
    }
    store.tasks = store.tasks.filter((task) => task.id !== id);
    await deleteImageFile(removed.image);
    await saveStore();
    sendJson(response, 200, { ok: true });
    return;
  }

  const imageMatch = url.pathname.match(/^\/api\/images\/([^/]+)$/);
  if (imageMatch && request.method === "GET") {
    await serveImage(response, imageMatch[1]);
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

async function serveStatic(response, requestedPath) {
  const cleanPath = requestedPath === "/" ? "/index.html" : decodeURIComponent(requestedPath);
  const filePath = path.normalize(path.join(ROOT, cleanPath));

  if (!filePath.startsWith(ROOT) || filePath.includes(`${path.sep}data${path.sep}`)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const body = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    response.end(body);
  } catch (error) {
    if (error.code === "ENOENT") {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    throw error;
  }
}

async function loadStore() {
  try {
    store = JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
    if (!Array.isArray(store.tasks)) store.tasks = [];
    store.settings = { ...DEFAULT_SETTINGS, ...(store.settings || {}) };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await saveStore();
  }
}

function saveStore() {
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DATA_FILE, `${JSON.stringify(store, null, 2)}\n`);
  });
  return writeQueue;
}

async function readJson(request) {
  let raw = "";
  let length = 0;
  for await (const chunk of request) {
    raw += chunk;
    length += chunk.length;
    if (length > MAX_REQUEST_BYTES) {
      throw new Error("Request body too large");
    }
  }
  return raw ? JSON.parse(raw) : {};
}

// Resolve an incoming image field to a stored reference URL.
// - data: URL  -> decode, write a file, return its /api/images/ URL
// - existing /api/images/ URL -> keep the current file unchanged
// - null/""/invalid -> clear (and remove the previous file)
async function persistImage(value, previous) {
  if (value === null || value === undefined || value === "") {
    await deleteImageFile(previous);
    return null;
  }
  if (typeof value !== "string") {
    return previous ?? null;
  }
  if (value.startsWith(IMAGE_URL_PREFIX)) {
    return previous ?? null;
  }

  const decoded = decodeImageDataUrl(value);
  if (!decoded) {
    return previous ?? null;
  }

  await fs.mkdir(IMAGE_DIR, { recursive: true });
  const filename = `${crypto.randomUUID()}.${decoded.ext}`;
  await fs.writeFile(path.join(IMAGE_DIR, filename), decoded.buffer);
  await deleteImageFile(previous);
  return `${IMAGE_URL_PREFIX}${filename}`;
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const tags = [];
  for (const raw of value) {
    if (typeof raw !== "string") continue;
    const tag = raw.trim().replace(/^#+/, "").toLowerCase().slice(0, 24);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
    if (tags.length >= 8) break;
  }
  return tags;
}

const RECURRENCES = new Set(["none", "daily", "weekly", "monthly"]);

function normalizeRecurrence(value) {
  return RECURRENCES.has(value) ? value : "none";
}

function isRecurring(recurrence) {
  return recurrence === "daily" || recurrence === "weekly" || recurrence === "monthly";
}

function advanceDueDate(dueDate, recurrence) {
  if (!dueDate) return null;
  const [year, month, day] = dueDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (recurrence === "daily") date.setDate(date.getDate() + 1);
  else if (recurrence === "weekly") date.setDate(date.getDate() + 7);
  else if (recurrence === "monthly") date.setMonth(date.getMonth() + 1);
  else return dueDate;
  return localDateKey(date);
}

async function copyImageFile(reference) {
  if (typeof reference !== "string" || !reference.startsWith(IMAGE_URL_PREFIX)) {
    return reference ?? null;
  }
  const srcName = path.basename(reference.slice(IMAGE_URL_PREFIX.length));
  const newName = `${crypto.randomUUID()}${path.extname(srcName) || ".png"}`;
  try {
    await fs.mkdir(IMAGE_DIR, { recursive: true });
    await fs.copyFile(path.join(IMAGE_DIR, srcName), path.join(IMAGE_DIR, newName));
    return `${IMAGE_URL_PREFIX}${newName}`;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function normalizeDueDate(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return value;
}

function decodeImageDataUrl(value) {
  const match = /^data:image\/(png|jpeg|jpg|webp|gif);base64,([a-z0-9+/=]+)$/i.exec(value);
  if (!match) return null;
  const ext = match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) return null;
  return { ext, buffer };
}

async function deleteImageFile(reference) {
  if (typeof reference !== "string" || !reference.startsWith(IMAGE_URL_PREFIX)) return;
  const filename = path.basename(reference.slice(IMAGE_URL_PREFIX.length));
  try {
    await fs.unlink(path.join(IMAGE_DIR, filename));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function serveImage(response, rawName) {
  const filename = path.basename(decodeURIComponent(rawName));
  const filePath = path.join(IMAGE_DIR, filename);
  if (!filePath.startsWith(IMAGE_DIR + path.sep)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const body = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filename)] || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    });
    response.end(body);
  } catch (error) {
    if (error.code === "ENOENT") {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    throw error;
  }
}

// One-time migration: convert any inline base64 images from older data files
// into image files on disk, replacing the field with a reference URL.
async function migrateLegacyImages() {
  let changed = false;
  for (const task of store.tasks) {
    if (typeof task.image === "string" && task.image.startsWith("data:")) {
      task.image = await persistImage(task.image, null);
      changed = true;
    }
  }
  if (changed) await saveStore();
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.completed) return b.createdAt - a.createdAt;
    return orderKey(a) - orderKey(b);
  });
}

// Open tasks follow an explicit manual `order` once reordered; until then they
// fall back to newest-first (a large negative key keeps new tasks on top).
function orderKey(task) {
  return typeof task.order === "number" ? task.order : -task.createdAt;
}

async function clearCompletedAfterNoon() {
  const now = new Date();
  const noon = new Date(now);
  noon.setHours(12, 0, 0, 0);
  const noonKey = localDateKey(noon);

  if (!store.settings.autoClearNoon) return;

  if (now >= noon && store.lastNoonCleanup !== noonKey) {
    const cleared = store.tasks.filter((task) => task.completed);
    store.tasks = store.tasks.filter((task) => !task.completed);
    store.lastNoonCleanup = noonKey;
    await saveStore();
    for (const task of cleared) {
      await deleteImageFile(task.image);
    }
  }
}

function scheduleNextNoonCleanup() {
  const now = new Date();
  const nextNoon = new Date(now);
  nextNoon.setHours(12, 0, 0, 0);
  if (now >= nextNoon) {
    nextNoon.setDate(nextNoon.getDate() + 1);
  }

  setTimeout(() => {
    clearCompletedAfterNoon()
      .catch((error) => console.error(error))
      .finally(scheduleNextNoonCleanup);
  }, nextNoon.getTime() - now.getTime() + 1000);
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
