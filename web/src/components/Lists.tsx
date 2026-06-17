import { useState, type KeyboardEvent } from "react";
import type { List } from "../types";
import { PlusIcon } from "./icons";

const INBOX_ID = "inbox";

interface Common {
  lists: List[];
  selected: string; // list id, or "all"
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

// ---- Desktop sidebar (vertical, with manage) ----
export function ListsNav({
  lists,
  selected,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: Common) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  function submitNew() {
    const name = draft.trim();
    if (name) onCreate(name);
    setDraft("");
    setAdding(false);
  }
  function submitRename(id: string) {
    const name = editName.trim();
    if (name) onRename(id, name);
    setEditId(null);
  }
  const itemClass = (on: boolean) =>
    `flex-1 truncate rounded-lg px-3 py-2 text-left font-display text-sm ${
      on ? "bg-ink font-semibold text-paper" : "text-ink hover:bg-sheet-2"
    }`;

  return (
    <div className="flex flex-col gap-0.5">
      <span className="label-mono mt-1 mb-1 px-1 !text-[10px]">Lists</span>
      <button className={itemClass(selected === "all")} onClick={() => onSelect("all")}>
        All Tasks
      </button>

      {lists.map((l) =>
        editId === l.id ? (
          <input
            key={l.id}
            autoFocus
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={() => submitRename(l.id)}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === "Enter") submitRename(l.id);
              if (e.key === "Escape") setEditId(null);
            }}
            maxLength={40}
            className="rounded-lg border-[1.8px] border-ink bg-transparent px-2.5 py-1.5 font-display text-sm text-ink outline-none"
          />
        ) : (
          <div key={l.id} className="group flex items-center gap-1">
            <button
              className={itemClass(selected === l.id)}
              onClick={() => onSelect(l.id)}
              onDoubleClick={() => {
                if (l.id !== INBOX_ID) {
                  setEditId(l.id);
                  setEditName(l.name);
                }
              }}
            >
              {l.name}
            </button>
            {l.id !== INBOX_ID && (
              <button
                onClick={() => onDelete(l.id)}
                aria-label={`Delete ${l.name}`}
                className="grid size-7 shrink-0 place-items-center rounded text-ink-3 opacity-0 group-hover:opacity-100 hover:text-red"
              >
                <svg viewBox="0 0 24 24" className="icon size-3.5">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        ),
      )}

      {adding ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={submitNew}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === "Enter") submitNew();
            if (e.key === "Escape") setAdding(false);
          }}
          maxLength={40}
          placeholder="List name…"
          className="rounded-lg border-[1.8px] border-dashed border-ink-3 bg-transparent px-2.5 py-1.5 font-display text-sm text-ink outline-none focus:border-ink placeholder:text-ink-3"
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-left font-mono text-xs text-ink-2 hover:text-ink"
        >
          <PlusIcon className="icon size-3.5" /> New list
        </button>
      )}
    </div>
  );
}

// ---- Mobile (horizontal chips, select + create) ----
export function ListChips({
  lists,
  selected,
  onSelect,
  onCreate,
}: Pick<Common, "lists" | "selected" | "onSelect" | "onCreate">) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  function submit() {
    const name = draft.trim();
    if (name) onCreate(name);
    setDraft("");
    setAdding(false);
  }
  const chip = (on: boolean) =>
    `shrink-0 rounded-full border-[1.5px] border-ink px-3 py-1 font-mono text-xs ${
      on ? "bg-ink font-semibold text-paper" : "text-ink"
    }`;

  return (
    <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 lg:hidden [scrollbar-width:none]">
      <button className={chip(selected === "all")} onClick={() => onSelect("all")}>
        All
      </button>
      {lists.map((l) => (
        <button
          key={l.id}
          className={chip(selected === l.id)}
          onClick={() => onSelect(l.id)}
        >
          {l.name}
        </button>
      ))}
      {adding ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={submit}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") setAdding(false);
          }}
          maxLength={40}
          placeholder="List name…"
          className="w-28 shrink-0 rounded-full border-[1.5px] border-dashed border-ink-3 bg-transparent px-3 py-1 font-mono text-xs text-ink outline-none placeholder:text-ink-3"
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          aria-label="New list"
          className="grid size-7 shrink-0 place-items-center rounded-full border-[1.5px] border-ink text-ink-2"
        >
          <PlusIcon className="icon size-3.5" />
        </button>
      )}
    </div>
  );
}
