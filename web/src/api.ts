import type { List, NewTask, Task } from "./types";

// Error thrown by req() — carries the HTTP status when the server responded
// (absent for a network failure / offline), so callers can tell them apart.
export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json())?.error ?? "";
    } catch {
      /* ignore */
    }
    throw new ApiError(detail || `${res.status} ${res.statusText}`, res.status);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listTasks: () => req<{ tasks: Task[] }>("/api/tasks").then((r) => r.tasks),

  createTask: (task: NewTask & { clientId?: string }) =>
    req<{ task: Task }>("/api/tasks", {
      method: "POST",
      body: JSON.stringify(task),
    }).then((r) => r.task),

  updateTask: (id: string, patch: Partial<Task>) =>
    req<{ task: Task }>(`/api/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  deleteTask: (id: string) =>
    req<{ ok: true }>(`/api/tasks/${id}`, { method: "DELETE" }),

  clearCompleted: () =>
    req<{ tasks: Task[] }>("/api/tasks/clear-completed", { method: "POST" }),

  reorder: (ids: string[]) =>
    req<{ tasks: Task[] }>("/api/tasks/reorder", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }).then((r) => r.tasks),

  getSettings: () =>
    req<{ settings: Settings }>("/api/settings").then((r) => r.settings),

  updateSettings: (patch: Partial<Settings>) =>
    req<{ settings: Settings }>("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(patch),
    }).then((r) => r.settings),

  listLists: () => req<{ lists: List[] }>("/api/lists").then((r) => r.lists),

  createList: (name: string) =>
    req<{ list: List }>("/api/lists", {
      method: "POST",
      body: JSON.stringify({ name }),
    }).then((r) => r.list),

  renameList: (id: string, name: string) =>
    req<{ list: List }>(`/api/lists/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }).then((r) => r.list),

  deleteList: (id: string) =>
    req<{ ok: true }>(`/api/lists/${id}`, { method: "DELETE" }),

  setTagColor: (tag: string, color: number | null) =>
    req<{ settings: Settings }>("/api/tag-color", {
      method: "POST",
      body: JSON.stringify({ tag, color }),
    }).then((r) => r.settings),
};

export interface Settings {
  autoClearNoon: boolean;
  tagColors: Record<string, number>;
}
