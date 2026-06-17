export type Priority = "none" | "low" | "medium" | "high";

export interface Task {
  id: string;
  title: string;
  image: string | null;
  tags: string[];
  priority: Priority;
  completed: boolean;
  createdAt: number;
  completedAt: number | null;
}

export interface NewTask {
  title: string;
  image?: string | null;
  tags?: string[];
  priority?: Priority;
}
