import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type RefObject,
} from "react";
import type { NewTask } from "../types";
import { ImageIcon, MicIcon, PlusIcon } from "./icons";
import { fileToDataUrl } from "../lib/image";
import { parseInput } from "../lib/tags";
import { useTagDot } from "./TagColor";

interface Props {
  onAdd: (task: NewTask) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}

// Web Speech API — present on Chrome/Safari (incl. iOS) under a webkit prefix.
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
const SpeechRecognition =
  typeof window !== "undefined"
    ? ((window as unknown as Record<string, unknown>).SpeechRecognition ??
        (window as unknown as Record<string, unknown>).webkitSpeechRecognition)
    : undefined;
const voiceSupported = Boolean(SpeechRecognition);

export function Composer({ onAdd, inputRef }: Props) {
  const [title, setTitle] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const tagDot = useTagDot();

  // Live-parse "#tag" tokens from the input.
  const parsed = useMemo(() => parseInput(title), [title]);

  useEffect(() => () => recognition.current?.stop(), []);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!parsed.title) return;
    onAdd({ title: parsed.title, tags: parsed.tags, image });
    setTitle("");
    setImage(null);
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

  // Paste a screenshot/image straight into the composer.
  async function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const item = [...e.clipboardData.items].find((i) =>
      i.type.startsWith("image/"),
    );
    const file = item?.getAsFile();
    if (!file) return;
    e.preventDefault();
    try {
      setImage(await fileToDataUrl(file));
    } catch {
      /* ignore */
    }
  }

  function toggleVoice() {
    if (!SpeechRecognition) return;
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const rec = new (SpeechRecognition as new () => SpeechRecognitionLike)();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (ev) => {
      const text = ev.results[0]?.[0]?.transcript ?? "";
      if (text) setTitle((t) => (t ? `${t} ${text}` : text));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognition.current = rec;
    setListening(true);
    rec.start();
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
          onPaste={onPaste}
          maxLength={140}
          placeholder="Add a task…  #tag"
          className="min-w-0 flex-1 bg-transparent py-1 font-display text-[15px] font-medium text-ink outline-none placeholder:text-ink-3"
        />

        {voiceSupported && (
          <button
            type="button"
            title={listening ? "Stop" : "Voice input"}
            onClick={toggleVoice}
            className={`grid size-9 place-items-center rounded-md hover:bg-sheet-2 ${
              listening ? "animate-pulse text-red" : "text-ink-2"
            }`}
          >
            <MicIcon className="icon size-[18px]" />
          </button>
        )}

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
              className="inline-flex items-center gap-1 font-mono text-[11px] text-ink-2"
            >
              <span className={`size-[6px] rounded-full ${tagDot(tag)}`} />
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
