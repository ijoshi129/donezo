import {
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import type { NewTask, Priority } from "../types";
import { FlagIcon, ImageIcon, PlusIcon } from "./icons";
import { fileToDataUrl } from "../lib/image";
import { parseTags } from "../lib/tags";
import { PRIORITY_FILL, PRIORITY_TEXT } from "../lib/priority";

interface Props {
  onAdd: (task: NewTask) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "none", label: "None" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export function Composer({ onAdd, inputRef }: Props) {
  const [title, setTitle] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [priority, setPriority] = useState<Priority>("none");
  const [prioOpen, setPrioOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Live-preview the "#tag" tokens detected in the input.
  const parsed = useMemo(() => parseTags(title), [title]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!parsed.title) return;
    onAdd({ title: parsed.title, tags: parsed.tags, image, priority });
    setTitle("");
    setImage(null);
    setPriority("none");
  }

  async function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setImage(await fileToDataUrl(file));
    } catch {
      /* ignore bad files */
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <form
        onSubmit={submit}
        className="flex items-center gap-1.5 rounded-lg border-[1.8px] border-ink bg-sheet py-1.5 pr-1.5 pl-3.5 focus-within:shadow-hard-sm"
      >
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={140}
          placeholder="Add a task…"
          className="min-w-0 flex-1 bg-transparent py-1 font-display text-[15px] font-medium text-ink outline-none placeholder:text-ink-3"
        />

        {/* priority */}
        <div className="relative">
          <button
            type="button"
            title="Priority"
            onClick={() => setPrioOpen((o) => !o)}
            className={`grid size-9 place-items-center rounded-md hover:bg-sheet-2 ${PRIORITY_TEXT[priority]}`}
          >
            <FlagIcon className="icon size-[18px]" />
          </button>
          {prioOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setPrioOpen(false)}
              />
              <div className="absolute top-full right-0 z-20 mt-1.5 w-32 overflow-hidden rounded-md border-[1.8px] border-ink bg-sheet shadow-hard-sm">
                {PRIORITIES.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => {
                      setPriority(p.value);
                      setPrioOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 font-mono text-xs ${
                      priority === p.value
                        ? `${PRIORITY_FILL[p.value]} font-semibold`
                        : "text-ink hover:bg-sheet-2"
                    }`}
                  >
                    <FlagIcon
                      className={`icon size-3 ${p.value === "none" ? "opacity-0" : PRIORITY_TEXT[p.value]}`}
                    />
                    {p.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          title="Attach image"
          onClick={() => fileRef.current?.click()}
          className={`grid size-9 place-items-center rounded-md hover:bg-sheet-2 ${
            image ? "text-ink" : "text-ink-2"
          }`}
        >
          <ImageIcon className="icon size-[18px]" />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={pickImage}
          className="hidden"
        />

        <button
          type="submit"
          title="Add task"
          className="grid size-9 place-items-center rounded-md border-[1.8px] border-ink bg-acid text-on-acid active:translate-y-px"
        >
          <PlusIcon className="icon size-[19px]" strokeWidth={2.4} />
        </button>
      </form>

      {image && (
        <div className="flex items-center gap-2.5 self-start rounded-md border-[1.8px] border-ink bg-sheet p-1.5 pr-3">
          <img
            src={image}
            alt=""
            className="size-10 rounded-[3px] border border-ink object-cover"
          />
          <span className="label-mono !normal-case !tracking-normal">
            Image attached
          </span>
          <button
            type="button"
            onClick={() => setImage(null)}
            aria-label="Remove image"
            className="grid size-6 place-items-center rounded border-[1.5px] border-ink text-ink hover:bg-ink hover:text-paper"
          >
            <svg viewBox="0 0 24 24" className="icon size-3">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {parsed.tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 self-start pl-0.5">
          {parsed.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-[5px] border-[1.5px] border-ink px-1.5 py-0.5 font-mono text-[11px] text-ink"
            >
              <span className="size-[6px] rounded-full bg-acid-deep" />
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
