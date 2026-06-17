import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import { api } from "./api";
import type { NewTask, Priority, Task } from "./types";
import { Composer } from "./components/Composer";
import { Progress } from "./components/Progress";
import { TaskRow } from "./components/TaskRow";
import { SortableTask } from "./components/SortableTask";
import { EditTaskModal } from "./components/EditTaskModal";
import { SettingsModal } from "./components/SettingsModal";
import { FilterModal } from "./components/FilterModal";
import { ListsNav, ListChips } from "./components/Lists";
import { Lightbox } from "./components/Lightbox";
import {
  FilterIcon,
  FlagIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
} from "./components/icons";
import { PRIORITY_FILL } from "./lib/priority";

const TASKS_KEY = ["tasks"] as const;
const LISTS_KEY = ["lists"] as const;
const INBOX_ID = "inbox";

export default function App() {
  const qc = useQueryClient();

  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [priorityFilters, setPriorityFilters] = useState<Priority[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedList, setSelectedList] = useState<string>("all");

  const { data: tasks = [], isLoading, isError, error } = useQuery({
    queryKey: TASKS_KEY,
    queryFn: api.listTasks,
  });
  const { data: lists = [] } = useQuery({
    queryKey: LISTS_KEY,
    queryFn: api.listLists,
  });

  // New tasks land in the selected list (or Inbox when viewing "all").
  const createListId = selectedList === "all" ? INBOX_ID : selectedList;
  const invalidateLists = () =>
    qc.invalidateQueries({ queryKey: LISTS_KEY });

  const createList = useMutation({
    mutationFn: (name: string) => api.createList(name),
    onSuccess: (list) => {
      invalidateLists();
      setSelectedList(list.id);
    },
  });
  const renameList = useMutation({
    mutationFn: (vars: { id: string; name: string }) =>
      api.renameList(vars.id, vars.name),
    onSuccess: invalidateLists,
  });
  const removeList = useMutation({
    mutationFn: (id: string) => api.deleteList(id),
    onSuccess: (_r, id) => {
      invalidateLists();
      qc.invalidateQueries({ queryKey: TASKS_KEY }); // orphans moved to Inbox
      if (selectedList === id) setSelectedList("all");
    },
  });

  // Shared optimistic plumbing: snapshot the list, apply `change` immediately,
  // roll back on error, and reconcile with the server when settled.
  function patchCache(change: (prev: Task[]) => Task[]) {
    return async () => {
      await qc.cancelQueries({ queryKey: TASKS_KEY });
      const previous = qc.getQueryData<Task[]>(TASKS_KEY) ?? [];
      qc.setQueryData<Task[]>(TASKS_KEY, change(previous));
      return { previous };
    };
  }
  const rollback = (
    _err: unknown,
    _vars: unknown,
    ctx: { previous: Task[] } | undefined,
  ) => {
    if (ctx) qc.setQueryData(TASKS_KEY, ctx.previous);
  };
  const settle = () => qc.invalidateQueries({ queryKey: TASKS_KEY });

  const create = useMutation({
    mutationFn: (vars: NewTask) => api.createTask(vars),
    onMutate: (vars) =>
      patchCache((prev) => [
        ...prev,
        {
          id: `temp-${crypto.randomUUID()}`,
          title: vars.title,
          notes: vars.notes ?? "",
          image: vars.image ?? null,
          tags: vars.tags ?? [],
          priority: vars.priority ?? "none",
          subtasks: vars.subtasks ?? [],
          pinned: vars.pinned ?? false,
          listId: vars.listId ?? createListId,
          completed: false,
          createdAt: Date.now(),
          completedAt: null,
        },
      ])(),
    onError: rollback,
    onSettled: settle,
  });

  const toggle = useMutation({
    mutationFn: (task: Task) =>
      api.updateTask(task.id, { completed: !task.completed }),
    onMutate: (task) =>
      patchCache((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? {
                ...t,
                completed: !t.completed,
                completedAt: t.completed ? null : Date.now(),
              }
            : t,
        ),
      )(),
    onError: rollback,
    onSettled: settle,
  });

  const edit = useMutation({
    mutationFn: (vars: { id: string; patch: Partial<Task> }) =>
      api.updateTask(vars.id, vars.patch),
    onMutate: (vars) =>
      patchCache((prev) =>
        prev.map((t) => (t.id === vars.id ? { ...t, ...vars.patch } : t)),
      )(),
    onError: rollback,
    onSettled: settle,
  });

  const reorder = useMutation({
    // `ordered` is the full task list already in its new order.
    mutationFn: (ordered: Task[]) => api.reorder(ordered.map((t) => t.id)),
    onMutate: (ordered) => patchCache(() => ordered)(),
    onError: rollback,
    onSettled: settle,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 160, tolerance: 6 },
    }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = open.map((t) => t.id);
    const from = ids.indexOf(active.id as string);
    const to = ids.indexOf(over.id as string);
    if (from < 0 || to < 0) return;
    const newOpen = arrayMove(open, from, to);
    flush();
    // Persist as: reordered open tasks first, then the done tasks unchanged.
    reorder.mutate([...newOpen, ...done]);
  }

  // ---- Undo: a marked-done / deleted action applies to the cache instantly
  // but its server call is held for UNDO_MS, so Undo just restores the cache
  // (and deleting never destroys the image file until the window passes). ----
  type Pending =
    | { kind: "complete"; task: Task }
    | { kind: "delete"; task: Task; index: number };
  const pending = useRef<Pending | null>(null);
  const timer = useRef<number | null>(null);
  const [toastKind, setToastKind] = useState<Pending["kind"] | null>(null);
  const UNDO_MS = 5000;

  const getTasks = () => qc.getQueryData<Task[]>(TASKS_KEY) ?? [];
  const setTasks = (next: Task[]) => qc.setQueryData<Task[]>(TASKS_KEY, next);

  // Commit the held action to the server (also called before any other action).
  // The optimistic cache already matches the committed result, so we avoid a
  // refetch on success (which could revert a newly-deferred action); we only
  // resync on error.
  function flush() {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setToastKind(null);
    const resync = () => qc.invalidateQueries({ queryKey: TASKS_KEY });
    const call =
      p.kind === "complete"
        ? api.updateTask(p.task.id, { completed: true })
        : api.deleteTask(p.task.id);
    call.then(() => {}, resync);
  }

  function defer(p: Pending) {
    flush(); // commit any prior held action first
    pending.current = p;
    if (p.kind === "complete") {
      setTasks(
        getTasks().map((t) =>
          t.id === p.task.id
            ? { ...t, completed: true, completedAt: Date.now() }
            : t,
        ),
      );
    } else {
      setTasks(getTasks().filter((t) => t.id !== p.task.id));
    }
    setToastKind(p.kind);
    timer.current = window.setTimeout(flush, UNDO_MS);
  }

  function undo() {
    const p = pending.current;
    if (!p) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
    setToastKind(null);
    if (p.kind === "complete") {
      setTasks(
        getTasks().map((t) =>
          t.id === p.task.id
            ? { ...t, completed: false, completedAt: null }
            : t,
        ),
      );
    } else {
      const next = getTasks().slice();
      next.splice(Math.min(p.index, next.length), 0, p.task);
      setTasks(next);
    }
  }

  // Action handlers (each flushes any held action so refetches can't revert it).
  const handleToggle = (task: Task) => {
    if (task.completed) {
      flush();
      toggle.mutate(task); // un-completing is immediate, no undo toast
    } else {
      defer({ kind: "complete", task });
    }
  };
  const handleDelete = (task: Task) => {
    const index = getTasks().findIndex((t) => t.id === task.id);
    defer({ kind: "delete", task, index });
  };
  const handleAdd = (vars: NewTask) => {
    flush();
    create.mutate({ ...vars, listId: vars.listId ?? createListId });
  };
  const handleSave = (id: string, patch: Partial<Task>) => {
    flush();
    edit.mutate({ id, patch });
  };

  const filtersActive = tagFilters.length > 0 || priorityFilters.length > 0;
  const filtering = query.trim() !== "" || filtersActive;

  const allTags = useMemo(
    () => [...new Set(tasks.flatMap((t) => t.tags))].sort(),
    [tasks],
  );

  const toggleTagFilter = (tag: string) =>
    setTagFilters((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  const togglePriorityFilter = (p: Priority) =>
    setPriorityFilters((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  const clearFilters = () => {
    setTagFilters([]);
    setPriorityFilters([]);
    setQuery("");
  };

  const { open, done } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (t: Task) =>
      (selectedList === "all" || t.listId === selectedList) &&
      (!q ||
        t.title.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q))) &&
      (tagFilters.length === 0 ||
        t.tags.some((tag) => tagFilters.includes(tag))) &&
      (priorityFilters.length === 0 || priorityFilters.includes(t.priority));
    const open: Task[] = [];
    const done: Task[] = [];
    for (const t of tasks) {
      if (!match(t)) continue;
      (t.completed ? done : open).push(t);
    }
    return { open, done };
  }, [tasks, query, tagFilters, priorityFilters, selectedList]);

  const toggleSearch = () => {
    setSearchOpen((v) => !v);
    if (searchOpen) setQuery("");
  };

  // Props every task row needs (callbacks + active-filter state).
  const rowProps = {
    onToggle: handleToggle,
    onDelete: handleDelete,
    onEdit: setEditing,
    onViewImage: setLightbox,
    onToggleTag: toggleTagFilter,
    onTogglePriority: togglePriorityFilter,
    activeTags: tagFilters,
    activePriorities: priorityFilters,
  };

  const content = (
    <>
      <ListChips
        lists={lists}
        selected={selectedList}
        onSelect={setSelectedList}
        onCreate={(name) => createList.mutate(name)}
      />

      {searchOpen ? (
        <div className="flex items-center gap-2.5 rounded-lg border-[1.8px] border-ink bg-sheet px-3.5 py-2.5">
          <SearchIcon className="icon size-[17px] text-ink-2" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks & tags"
            className="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-ink outline-none placeholder:text-ink-3"
          />
        </div>
      ) : (
        <Composer onAdd={handleAdd} />
      )}

      <Progress remaining={open.length} done={done.length} />

      {(tagFilters.length > 0 || priorityFilters.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 px-0.5">
          <span className="label-mono !text-[10px]">Filter</span>
          {priorityFilters.map((p) => (
            <FilterChip
              key={`p-${p}`}
              label={p}
              className={`border-transparent ${PRIORITY_FILL[p]}`}
              onRemove={() => togglePriorityFilter(p)}
            >
              <FlagIcon className="icon size-3" />
            </FilterChip>
          ))}
          {tagFilters.map((tag) => (
            <FilterChip
              key={`t-${tag}`}
              label={tag}
              className="border-ink bg-acid text-on-acid"
              onRemove={() => toggleTagFilter(tag)}
            >
              <span className="size-[6px] rounded-full bg-on-acid" />
            </FilterChip>
          ))}
          <button
            onClick={clearFilters}
            className="font-mono text-[11px] tracking-wide text-ink-2 uppercase underline-offset-2 hover:text-ink hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      {isLoading && <p className="label-mono mt-6 text-center">Loading…</p>}
      {isError && (
        <p className="label-mono mt-6 text-center !text-red">
          {(error as Error).message}
        </p>
      )}

      {!isLoading && !isError && (
        <>
          <Section title={filtering ? "Matches" : "Open"} count={open.length} />
          {open.length === 0 ? (
            <p className="label-mono px-1.5 py-3">
              {filtering ? "No matches." : "Nothing left. Nice."}
            </p>
          ) : filtering ? (
            // No reordering while filtering — order would be ambiguous.
            <div className="flex flex-col">
              {open.map((task) => (
                <TaskRow key={task.id} task={task} {...rowProps} />
              ))}
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
              onDragEnd={onDragEnd}
            >
              <SortableContext
                items={open.map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex flex-col">
                  {open.map((task) => (
                    <SortableTask key={task.id} task={task} {...rowProps} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {done.length > 0 && (
            <>
              <Section title="Done" count={done.length} />
              <div className="flex flex-col">
                {done.map((task) => (
                  <TaskRow key={task.id} task={task} {...rowProps} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  );

  return (
    <div className="h-full lg:flex">
      {/* Desktop sidebar */}
      <aside className="hidden shrink-0 flex-col gap-2 border-r-[1.8px] border-ink px-5 py-6 lg:flex lg:w-[272px]">
        <h1 className="mb-3 font-display text-[26px] font-extrabold tracking-tight">
          Donezo
        </h1>
        <button
          onClick={() => setCreating(true)}
          className="mb-1 flex items-center justify-center gap-2 rounded-lg border-[1.8px] border-ink bg-acid py-2.5 font-display text-sm font-semibold text-on-acid shadow-hard-sm transition-transform active:translate-y-0.5"
        >
          <PlusIcon className="icon size-[18px]" strokeWidth={2.6} /> New task
        </button>
        <SidebarItem active={searchOpen} onClick={toggleSearch} label="Search">
          <SearchIcon className="icon size-[18px]" />
        </SidebarItem>
        <SidebarItem
          active={filtersActive}
          onClick={() => setFilterOpen(true)}
          label="Filter"
        >
          <FilterIcon className="icon size-[18px]" />
        </SidebarItem>

        <div className="mt-3 overflow-y-auto">
          <ListsNav
            lists={lists}
            selected={selectedList}
            onSelect={setSelectedList}
            onCreate={(name) => createList.mutate(name)}
            onRename={(id, name) => renameList.mutate({ id, name })}
            onDelete={(id) => removeList.mutate(id)}
          />
        </div>

        <div className="mt-auto" />
        <SidebarItem onClick={() => setSettingsOpen(true)} label="Settings">
          <SettingsIcon className="icon size-[18px]" />
        </SidebarItem>
      </aside>

      {/* Main column */}
      <div className="relative flex h-full flex-1 flex-col">
        <header className="flex items-center gap-2.5 px-[18px] pt-4 pb-3 lg:hidden">
          <h1 className="flex-1 font-display text-[25px] font-extrabold tracking-tight">
            Donezo
          </h1>
          <IconButton label="Search" active={searchOpen} onClick={toggleSearch}>
            <SearchIcon className="icon size-[18px]" />
          </IconButton>
          <IconButton
            label="Filter"
            active={filtersActive}
            onClick={() => setFilterOpen(true)}
          >
            <FilterIcon className="icon size-[18px]" />
          </IconButton>
          <IconButton label="Settings" onClick={() => setSettingsOpen(true)}>
            <SettingsIcon className="icon size-[18px]" />
          </IconButton>
        </header>

        <main className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[460px] flex-col gap-3.5 px-4 pb-28 lg:max-w-[760px] lg:px-10 lg:pt-8 lg:pb-12">
            {content}
          </div>
        </main>

        <button
          aria-label="Create a task"
          onClick={() => setCreating(true)}
          className="absolute right-[18px] bottom-[22px] grid size-14 place-items-center rounded-2xl border-2 border-ink bg-acid text-on-acid shadow-hard transition-transform active:translate-y-0.5 lg:hidden"
        >
          <PlusIcon className="icon size-6" strokeWidth={2.6} />
        </button>
      </div>

      <EditTaskModal
        open={creating || editing !== null}
        task={editing}
        lists={lists}
        defaultListId={createListId}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
        onSave={handleSave}
        onCreate={handleAdd}
      />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <FilterModal
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        allTags={allTags}
        tagFilters={tagFilters}
        priorityFilters={priorityFilters}
        onToggleTag={toggleTagFilter}
        onTogglePriority={togglePriorityFilter}
        onClear={clearFilters}
      />
      <Lightbox src={lightbox} onClose={() => setLightbox(null)} />

      <AnimatePresence>
        {toastKind && (
          <motion.div
            key="undo-toast"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 32 }}
            className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-lg border-[1.8px] border-ink bg-ink py-2.5 pr-3 pl-4 shadow-hard-sm"
          >
            <span className="font-display text-sm font-semibold text-paper">
              {toastKind === "complete" ? "Marked done" : "Deleted"}
            </span>
            <button
              onClick={undo}
              className="rounded border-[1.5px] border-acid px-2 py-0.5 font-mono text-xs font-medium tracking-wide text-acid uppercase hover:bg-acid hover:text-on-acid"
            >
              Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function IconButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={`grid size-[38px] place-items-center rounded-[10px] border-[1.8px] border-ink transition-colors ${
        active ? "bg-ink text-paper" : "text-ink hover:bg-ink hover:text-paper"
      }`}
    >
      {children}
    </button>
  );
}

function SidebarItem({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-lg border-[1.8px] border-ink px-3 py-2.5 font-display text-sm font-semibold transition-colors ${
        active ? "bg-ink text-paper" : "text-ink hover:bg-ink hover:text-paper"
      }`}
    >
      {children}
      {label}
    </button>
  );
}

function FilterChip({
  label,
  onRemove,
  className,
  children,
}: {
  label: string;
  onRemove: () => void;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onRemove}
      className={`inline-flex items-center gap-1.5 rounded-[5px] border-[1.5px] px-1.5 py-0.5 font-mono text-[11px] ${className}`}
    >
      {children}
      {label}
      <svg viewBox="0 0 24 24" className="icon size-3" strokeWidth={2.4}>
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  );
}

function Section({ title, count }: { title: string; count: number }) {
  return (
    <div className="label-mono mt-1 flex items-center gap-2.5 px-0.5 !tracking-[0.16em]">
      {title} <span className="text-ink-2">· {count}</span>
      <span className="h-[1.5px] flex-1 bg-hair-2" />
    </div>
  );
}
