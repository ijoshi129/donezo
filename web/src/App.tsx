import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
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
import type { NewTask, Task } from "./types";
import { Composer } from "./components/Composer";
import { Progress } from "./components/Progress";
import { TaskRow } from "./components/TaskRow";
import { SortableTask } from "./components/SortableTask";
import { EditTaskModal } from "./components/EditTaskModal";
import { SettingsModal } from "./components/SettingsModal";
import { FilterModal } from "./components/FilterModal";
import { CommandPalette, type Command } from "./components/CommandPalette";
import { Lightbox } from "./components/Lightbox";
import { setThemePref } from "./lib/theme";
import {
  ChevronIcon,
  CommandIcon,
  FilterIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
} from "./components/icons";
import { autoIndex, dotClass } from "./lib/tagcolor";
import { TagColorProvider } from "./components/TagColor";
import { outbox, applyOps } from "./lib/outbox";

const TASKS_KEY = ["tasks"] as const;

export default function App() {
  const qc = useQueryClient();

  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [doneCollapsed, setDoneCollapsed] = useState(
    () => localStorage.getItem("donezo:done-collapsed") === "1",
  );
  const toggleDone = () =>
    setDoneCollapsed((v) => {
      localStorage.setItem("donezo:done-collapsed", v ? "0" : "1");
      return !v;
    });

  const { data: serverTasks = [], isLoading, isError, error } = useQuery({
    queryKey: TASKS_KEY,
    queryFn: api.listTasks,
  });
  // Pending offline writes overlaid on the server snapshot (always shown).
  const pendingOps = useSyncExternalStore(outbox.subscribe, outbox.getOps);
  const tasks = useMemo(
    () => applyOps(serverTasks, pendingOps),
    [serverTasks, pendingOps],
  );
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  // Configure reconcile callbacks, then start replay triggers (after config so a
  // replay never runs before the callbacks exist).
  useEffect(() => {
    outbox.start({
      onDrained: () => qc.invalidateQueries({ queryKey: TASKS_KEY }),
      reconcileCreate: (_tempId, real) =>
        qc.setQueryData<Task[]>(TASKS_KEY, (prev) => {
          const list = prev ?? [];
          return list.some((t) => t.id === real.id) ? list : [real, ...list];
        }),
    });
  }, [qc]);

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
  });
  const tagColors = settings?.tagColors ?? {};
  const tagDot = (tag: string) =>
    dotClass(typeof tagColors[tag] === "number" ? tagColors[tag] : autoIndex(tag));

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

  // Reorder stays a normal online mutation (manual order is a server concept;
  // temp ids of not-yet-synced tasks are filtered out of the payload).
  const reorder = useMutation({
    mutationFn: (ordered: Task[]) =>
      api.reorder(ordered.filter((t) => !t.id.startsWith("temp-")).map((t) => t.id)),
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
    reorder.mutate([...arrayMove(open, from, to), ...done]);
  }

  // ---- Writes go through the offline outbox: applied optimistically via the
  // overlay, held UNDO_MS for undo when marking done / deleting, replayed when
  // possible. Undo just cancels the queued op. ----
  const UNDO_MS = 5000;
  const [toastKind, setToastKind] = useState<"complete" | "delete" | null>(null);
  const lastUndo = useRef<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  function showToast(kind: "complete" | "delete", opId: string) {
    lastUndo.current = opId;
    setToastKind(kind);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => {
      setToastKind(null);
      lastUndo.current = null;
    }, UNDO_MS);
  }
  function undo() {
    if (lastUndo.current) outbox.cancel(lastUndo.current);
    lastUndo.current = null;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastKind(null);
  }

  const handleToggle = (task: Task) => {
    if (task.completed) {
      outbox.updateTask(task.id, { completed: false, completedAt: null });
    } else {
      const opId = outbox.updateTask(
        task.id,
        { completed: true, completedAt: Date.now() },
        UNDO_MS,
      );
      showToast("complete", opId);
    }
  };
  const handleDelete = (task: Task) => {
    const opId = outbox.deleteTask(task.id, UNDO_MS);
    if (opId) showToast("delete", opId);
  };
  const handleAdd = (vars: NewTask) => {
    outbox.createTask({
      id: `temp-${crypto.randomUUID()}`,
      title: vars.title,
      notes: vars.notes ?? "",
      image: vars.image ?? null,
      tags: vars.tags ?? [],
      pinned: vars.pinned ?? false,
      completed: false,
      createdAt: Date.now(),
      completedAt: null,
    });
  };
  const handleSave = (id: string, patch: Partial<Task>) => {
    outbox.updateTask(id, patch);
  };

  const filtersActive = tagFilters.length > 0;
  const filtering = query.trim() !== "" || filtersActive;

  const allTags = useMemo(
    () => [...new Set(tasks.flatMap((t) => t.tags))].sort(),
    [tasks],
  );

  const toggleTagFilter = (tag: string) =>
    setTagFilters((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  const clearFilters = () => {
    setTagFilters([]);
    setQuery("");
  };

  // ---- Command palette ----
  const commands: Command[] = useMemo(() => {
    const cmds: Command[] = [
      { id: "new", label: "New task", hint: "N", run: () => setCreating(true) },
      {
        id: "search",
        label: "Search tasks",
        hint: "/",
        keywords: "find",
        run: () => setSearchOpen(true),
      },
      { id: "filter", label: "Filter", hint: "F", run: () => setFilterOpen(true) },
      { id: "settings", label: "Settings", run: () => setSettingsOpen(true) },
    ];
    if (filtersActive)
      cmds.push({ id: "clearf", label: "Clear filters", run: clearFilters });
    cmds.push(
      { id: "t-light", label: "Theme: Light", keywords: "appearance", run: () => setThemePref("light") },
      { id: "t-dark", label: "Theme: Dark", keywords: "appearance", run: () => setThemePref("dark") },
      { id: "t-auto", label: "Theme: Auto", keywords: "appearance", run: () => setThemePref("auto") },
    );
    return cmds;
  }, [filtersActive]);

  const anyModalOpen =
    paletteOpen ||
    creating ||
    editing !== null ||
    settingsOpen ||
    filterOpen ||
    lightbox !== null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const typing =
        !!el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable);
      if (typing || anyModalOpen) return;
      if (e.key === "n") {
        e.preventDefault();
        setCreating(true);
      } else if (e.key === "/") {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === "f") {
        e.preventDefault();
        setFilterOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anyModalOpen]);

  // Live sync: refetch when another device (or this one) changes data.
  useEffect(() => {
    const es = new EventSource("/api/events");
    es.onmessage = () => qc.invalidateQueries({ queryKey: TASKS_KEY });
    return () => es.close();
  }, [qc]);

  const { open, done } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (t: Task) =>
      (!q ||
        t.title.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q))) &&
      (tagFilters.length === 0 ||
        t.tags.some((tag) => tagFilters.includes(tag)));
    const open: Task[] = [];
    const done: Task[] = [];
    for (const t of tasks) {
      if (!match(t)) continue;
      (t.completed ? done : open).push(t);
    }
    return { open, done };
  }, [tasks, query, tagFilters]);

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
    activeTags: tagFilters,
  };

  const content = (
    <>
      {(!online || pendingOps.length > 0) && (
        <div className="flex items-center gap-2 rounded-md border-[1.8px] border-ink bg-sheet px-3 py-2 font-mono text-[11px] text-ink-2">
          <span
            className={`size-2 rounded-full ${online ? "bg-acid-deep" : "bg-ink-3"}`}
          />
          {online
            ? `Syncing ${pendingOps.length} change${pendingOps.length === 1 ? "" : "s"}…`
            : pendingOps.length > 0
              ? `Offline — ${pendingOps.length} change${pendingOps.length === 1 ? "" : "s"} will sync`
              : "Offline"}
        </div>
      )}

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

      {tagFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-0.5">
          <span className="label-mono !text-[10px]">Filter</span>
          {tagFilters.map((tag) => (
            <FilterChip
              key={`t-${tag}`}
              label={tag}
              className="border-ink text-ink"
              onRemove={() => toggleTagFilter(tag)}
            >
              <span className={`size-[6px] rounded-full ${tagDot(tag)}`} />
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
              <Section
                title="Done"
                count={done.length}
                collapsed={doneCollapsed}
                onToggle={toggleDone}
              />
              {!doneCollapsed && (
                <div className="flex flex-col">
                  {done.map((task) => (
                    <TaskRow key={task.id} task={task} {...rowProps} />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </>
  );

  return (
    <TagColorProvider overrides={tagColors}>
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
        <SidebarItem
          onClick={() => setPaletteOpen(true)}
          label="Command"
          hint="⌘K"
        >
          <CommandIcon className="icon size-[18px]" />
        </SidebarItem>
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
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
        onSave={handleSave}
        onCreate={handleAdd}
      />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        allTags={allTags}
      />
      <FilterModal
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        allTags={allTags}
        tagFilters={tagFilters}
        onToggleTag={toggleTagFilter}
        onClear={clearFilters}
      />
      <Lightbox src={lightbox} onClose={() => setLightbox(null)} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={commands}
      />

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
    </TagColorProvider>
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
  hint,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  hint?: string;
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
      {hint && (
        <span className="ml-auto font-mono text-[11px] font-normal opacity-50">
          {hint}
        </span>
      )}
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
  children?: React.ReactNode;
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

function Section({
  title,
  count,
  collapsed,
  onToggle,
}: {
  title: string;
  count: number;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const body = (
    <>
      {onToggle && (
        <ChevronIcon
          className={`icon size-3.5 transition-transform ${collapsed ? "-rotate-90" : ""}`}
        />
      )}
      {title} <span className="text-ink-2">· {count}</span>
      <span className="h-[1.5px] flex-1 bg-hair-2" />
    </>
  );
  const cls =
    "label-mono mt-1 flex w-full items-center gap-2.5 px-0.5 !tracking-[0.16em]";
  return onToggle ? (
    <button onClick={onToggle} className={`${cls} text-left`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}
