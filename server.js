const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "tasks.json");
const MAX_REQUEST_BYTES = 6_000_000;
const MAX_IMAGE_BYTES = 5_500_000;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
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
      image: normalizeImage(body.image),
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
    if (typeof body.completed === "boolean") {
      task.completed = body.completed;
      task.completedAt = body.completed ? Date.now() : null;
    }
    if (typeof body.title === "string") {
      task.title = body.title.trim().slice(0, 140) || task.title;
    }
    if (Object.hasOwn(body, "image")) {
      task.image = normalizeImage(body.image);
    }

    await saveStore();
    sendJson(response, 200, { task });
    return;
  }

  if (taskMatch && request.method === "DELETE") {
    const id = decodeURIComponent(taskMatch[1]);
    const before = store.tasks.length;
    store.tasks = store.tasks.filter((task) => task.id !== id);
    if (store.tasks.length === before) {
      sendJson(response, 404, { error: "Task not found" });
      return;
    }

    await saveStore();
    sendJson(response, 200, { ok: true });
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

function normalizeImage(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return null;
  if (Buffer.byteLength(value, "utf8") > MAX_IMAGE_BYTES) return null;
  if (!/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[a-z0-9+/=]+$/i.test(value)) return null;
  return value;
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
    return b.createdAt - a.createdAt;
  });
}

async function clearCompletedAfterNoon() {
  const now = new Date();
  const noon = new Date(now);
  noon.setHours(12, 0, 0, 0);
  const noonKey = localDateKey(noon);

  if (!store.settings.autoClearNoon) return;

  if (now >= noon && store.lastNoonCleanup !== noonKey) {
    store.tasks = store.tasks.filter((task) => !task.completed);
    store.lastNoonCleanup = noonKey;
    await saveStore();
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
