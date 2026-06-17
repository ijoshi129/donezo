import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { List, Priority, Subtask, Task } from "../types";
import { Modal } from "./Modal";
import { CheckIcon, FlagIcon, ImageIcon, PinIcon } from "./icons";
import { fileToDataUrl } from "../lib/image";
import { PRIORITY_FILL } from "../lib/priority";

export interface TaskValues {
  title: string;
  notes: string;
  tags: string[];
  priority: Priority;
  subtasks: Subtask[];
  pinned: boolean;
  listId: string;
  image: string | null;
}

interface Props {
  open: boolean;
  task: Task | null; // null => create mode
  lists: List[];
  defaultListId: string;
  onClose: () => void;
  onSave: (id: string, patch: Partial<Task>) => void;
  onCreate: (values: TaskValues) => void;
}

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "none", label: "None" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Med" },
  { value: "high", label: "High" },
];

let tmp = 0;
const tmpId = () => `st-${Date.now()}-${tmp++}`;

export function EditTaskModal({
  open,
  task,
  lists,
  defaultListId,
  onClose,
  onSave,
  onCreate,
}: Props) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [priority, setPriority] = useState<Priority>("none");
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [subDraft, setSubDraft] = useState("");
  const [pinned, setPinned] = useState(false);
  const [listId, setListId] = useState(defaultListId);
  const [tagDraft, setTagDraft] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Re-seed local state each time the modal opens (empty for create mode).
  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setNotes(task?.notes ?? "");
    setTags(task?.tags ?? []);
    setPriority(task?.priority ?? "none");
    setSubtasks(task?.subtasks ?? []);
    setSubDraft("");
    setPinned(task?.pinned ?? false);
    setListId(task?.listId ?? defaultListId);
    setTagDraft("");
    setImage(task?.image ?? null);
  }, [open, task, defaultListId]);

  async function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setImage(await fileToDataUrl(file));
    } catch {
      /* ignore */
    }
  }

  function commitTag() {
    const t = tagDraft.trim().toLowerCase().slice(0, 24);
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagDraft("");
  }
  function onTagKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitTag();
    } else if (e.key === "Backspace" && !tagDraft && tags.length) {
      setTags(tags.slice(0, -1));
    }
  }

  function addSubtask() {
    const t = subDraft.trim().slice(0, 140);
    if (!t) return;
    setSubtasks([...subtasks, { id: tmpId(), title: t, done: false }]);
    setSubDraft("");
  }

  function save() {
    const trimmed = title.trim();
    if (!trimmed) return;
    const values: TaskValues = {
      title: trimmed,
      notes: notes.trim(),
      tags,
      priority,
      subtasks: subtasks.filter((s) => s.title.trim()),
      pinned,
      listId,
      image, // existing /api/images URL is kept; data: URL replaces; null clears
    };
    if (task) onSave(task.id, values);
    else onCreate(values);
    onClose();
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={task ? "Edit task" : "New task"}
    >
      <div className="flex flex-col gap-[15px]">
        <Field label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={140}
            autoFocus
            className="w-full rounded-md border-[1.8px] border-ink bg-transparent px-3 py-2.5 font-display text-lg font-bold tracking-tight text-ink outline-none focus:shadow-hard-sm"
          />
        </Field>

        <div className="flex gap-3">
          <Field label="List" className="min-w-0 flex-1">
            <select
              value={listId}
              onChange={(e) => setListId(e.target.value)}
              className="w-full rounded-md border-[1.8px] border-ink bg-transparent px-3 py-2.5 font-mono text-sm text-ink outline-none focus:shadow-hard-sm"
            >
              {lists.map((l) => (
                <option key={l.id} value={l.id} className="bg-sheet text-ink">
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Pin">
            <button
              type="button"
              onClick={() => setPinned((v) => !v)}
              aria-pressed={pinned}
              className={`grid size-[42px] place-items-center rounded-md border-[1.8px] border-ink ${
                pinned ? "bg-acid text-on-acid" : "text-ink-2"
              }`}
            >
              <PinIcon className="icon size-[18px]" />
            </button>
          </Field>
        </div>

        <Field label="Priority">
          <div className="flex overflow-hidden rounded-md border-[1.8px] border-ink">
            {PRIORITIES.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPriority(p.value)}
                className={`flex flex-1 items-center justify-center gap-1.5 border-r-[1.8px] border-ink py-2.5 font-mono text-[11px] tracking-wide uppercase last:border-r-0 ${
                  priority === p.value
                    ? `${PRIORITY_FILL[p.value]} font-semibold`
                    : "text-ink-2"
                }`}
              >
                {p.value !== "none" && <FlagIcon className="icon size-3" />}
                {p.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={4000}
            placeholder="Add details…"
            className="w-full resize-y rounded-md border-[1.8px] border-ink bg-transparent px-3 py-2.5 font-display text-sm text-ink outline-none focus:shadow-hard-sm placeholder:text-ink-3"
          />
        </Field>

        <Field label="Subtasks">
          <div className="flex flex-col gap-1.5">
            {subtasks.map((st) => (
              <div key={st.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSubtasks(
                      subtasks.map((s) =>
                        s.id === st.id ? { ...s, done: !s.done } : s,
                      ),
                    )
                  }
                  className={`grid size-[18px] shrink-0 place-items-center rounded-[5px] border-2 border-ink ${
                    st.done ? "bg-ink text-acid" : "text-transparent"
                  }`}
                >
                  <CheckIcon className="icon size-2.5" strokeWidth={3} />
                </button>
                <input
                  value={st.title}
                  onChange={(e) =>
                    setSubtasks(
                      subtasks.map((s) =>
                        s.id === st.id ? { ...s, title: e.target.value } : s,
                      ),
                    )
                  }
                  className={`min-w-0 flex-1 bg-transparent font-display text-sm outline-none ${
                    st.done ? "text-ink-3 line-through" : "text-ink"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setSubtasks(subtasks.filter((s) => s.id !== st.id))}
                  aria-label="Remove subtask"
                  className="grid size-6 shrink-0 place-items-center rounded text-ink-3 hover:text-ink"
                >
                  <svg viewBox="0 0 24 24" className="icon size-3.5">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            <input
              value={subDraft}
              onChange={(e) => setSubDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSubtask();
                }
              }}
              onBlur={addSubtask}
              maxLength={140}
              placeholder="add a step…"
              className="rounded-md border-[1.8px] border-dashed border-ink-3 bg-transparent px-3 py-2 font-display text-sm text-ink outline-none focus:border-ink placeholder:text-ink-3"
            />
          </div>
        </Field>

        <Field label="Tags">
          <div className="flex flex-wrap items-center gap-1.5 rounded-md border-[1.8px] border-ink px-2.5 py-2">
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setTags(tags.filter((t) => t !== tag))}
                title="Remove tag"
                className="inline-flex items-center gap-1.5 rounded-[5px] border-[1.5px] border-ink px-2 py-0.5 font-mono text-xs hover:bg-ink hover:text-paper"
              >
                <span className="size-[7px] rounded-full bg-ink-2" />
                {tag}
              </button>
            ))}
            <input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={onTagKey}
              onBlur={commitTag}
              placeholder="add tag…"
              className="min-w-[70px] flex-1 bg-transparent font-mono text-xs text-ink outline-none placeholder:text-ink-3"
            />
          </div>
        </Field>

        <Field label="Image">
          {image ? (
            <div className="flex items-center gap-3 rounded-md border-[1.8px] border-ink p-2 pr-3">
              <img
                src={image}
                alt=""
                className="size-12 rounded-[3px] border border-ink object-cover"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="font-mono text-xs text-ink underline underline-offset-2"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={() => setImage(null)}
                className="ml-auto grid size-7 place-items-center rounded border-[1.5px] border-ink text-ink hover:bg-ink hover:text-paper"
                aria-label="Remove image"
              >
                <svg viewBox="0 0 24 24" className="icon size-[14px]">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center gap-3 rounded-md border-[1.8px] border-dashed border-ink-3 p-3 font-mono text-xs text-ink-2 hover:border-ink hover:text-ink"
            >
              <span className="grid size-[38px] place-items-center rounded-[5px] border-[1.8px] border-ink text-ink">
                <ImageIcon className="icon size-[18px]" />
              </span>
              <span>
                Attach an image — <span className="text-ink underline">browse</span>
              </span>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={pickImage}
            className="hidden"
          />
        </Field>

        <div className="mt-1 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-md border-[1.8px] border-ink py-3 font-display text-sm font-semibold text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            className="flex-1 rounded-md border-[1.8px] border-ink bg-acid py-3 font-display text-sm font-semibold text-on-acid shadow-hard-sm active:translate-y-0.5"
          >
            {task ? "Save" : "Add task"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <span className="label-mono mb-1.5 block !text-[10.5px] !tracking-[0.14em]">
        {label}
      </span>
      {children}
    </div>
  );
}
