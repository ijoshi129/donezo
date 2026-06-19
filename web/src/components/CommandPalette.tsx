import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "motion/react";
import { SearchIcon } from "./icons";

export interface Command {
  id: string;
  label: string;
  hint?: string; // right-aligned (shortcut or category)
  keywords?: string;
  run: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}

export function CommandPalette({ open, onClose, commands }: Props) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return commands;
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(s) ||
        c.keywords?.toLowerCase().includes(s),
    );
  }, [q, commands]);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
    }
  }, [open]);
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  function run(c: Command) {
    onClose();
    c.run();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = filtered[active];
      if (c) run(c);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-[55] bg-ink/40 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild aria-describedby={undefined}>
              <div className="pointer-events-none fixed inset-0 z-[60] flex justify-center px-4 pt-[12vh]">
                <motion.div
                  className="pointer-events-auto flex h-fit max-h-[70vh] w-full max-w-[480px] flex-col overflow-hidden rounded-xl border-2 border-ink bg-sheet shadow-hard"
                  initial={{ y: -12, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -12, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 420, damping: 32 }}
                >
                  <Dialog.Title className="sr-only">Command palette</Dialog.Title>
                  <div className="flex items-center gap-2.5 border-b-[1.8px] border-ink px-4 py-3">
                    <SearchIcon className="icon size-[18px] text-ink-2" />
                    <input
                      autoFocus
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      onKeyDown={onKey}
                      placeholder="Type a command…"
                      className="min-w-0 flex-1 bg-transparent font-display text-[15px] text-ink outline-none placeholder:text-ink-3"
                    />
                  </div>

                  <div className="overflow-y-auto py-1.5">
                    {filtered.length === 0 ? (
                      <p className="label-mono px-4 py-4 text-center">
                        No commands.
                      </p>
                    ) : (
                      filtered.map((c, i) => (
                        <button
                          key={c.id}
                          type="button"
                          onMouseMove={() => setActive(i)}
                          onClick={() => run(c)}
                          className={`flex w-full items-center justify-between px-4 py-2.5 text-left font-display text-sm ${
                            i === active
                              ? "bg-ink text-paper"
                              : "text-ink hover:bg-sheet-2"
                          }`}
                        >
                          {c.label}
                          {c.hint && (
                            <span
                              className={`ml-3 font-mono text-[11px] ${
                                i === active ? "text-paper/70" : "text-ink-3"
                              }`}
                            >
                              {c.hint}
                            </span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </motion.div>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
