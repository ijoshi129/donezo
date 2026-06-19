export type Priority = "none" | "low" | "medium" | "high";

export interface List {
  id: string;
  name: string;
  createdAt: number;
}

export interface Task {
  id: string;
  clientId?: string | null;
  title: string;
  notes: string;
  image: string | null;
  tags: string[];
  priority: Priority;
  pinned: boolean;
  listId: string;
  completed: boolean;
  createdAt: number;
  completedAt: number | null;
}

export interface NewTask {
  title: string;
  notes?: string;
  image?: string | null;
  tags?: string[];
  priority?: Priority;
  pinned?: boolean;
  listId?: string;
}
