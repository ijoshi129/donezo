export interface Task {
  id: string;
  clientId?: string | null;
  title: string;
  notes: string;
  image: string | null;
  tags: string[];
  pinned: boolean;
  completed: boolean;
  createdAt: number;
  completedAt: number | null;
}

export interface NewTask {
  title: string;
  notes?: string;
  image?: string | null;
  tags?: string[];
  pinned?: boolean;
}
