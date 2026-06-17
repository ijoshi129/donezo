import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}

export function Modal({ open, onOpenChange, title, children }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              aria-describedby={undefined}
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              {/* Full-screen positioner: bottom-sheet on mobile, centered on desktop.
                  pointer-events pass through empty space so a click closes it. */}
              <div className="pointer-events-none fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center sm:p-6">
                <motion.div
                  className="pointer-events-auto max-h-[92vh] w-full max-w-[460px] overflow-y-auto rounded-t-2xl border-2 border-ink bg-sheet p-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:rounded-2xl sm:pb-5 sm:shadow-hard"
                  initial={{ y: "100%", opacity: 0.5 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: "100%", opacity: 0 }}
                  transition={{ type: "spring", stiffness: 380, damping: 36 }}
                >
                  <div className="mb-[18px] flex items-center justify-between">
                    <Dialog.Title className="font-display text-xl font-extrabold tracking-tight">
                      {title}
                    </Dialog.Title>
                    <Dialog.Close
                      aria-label="Close"
                      className="grid size-8 place-items-center rounded-lg border-[1.8px] border-ink text-ink hover:bg-ink hover:text-paper"
                    >
                      <svg viewBox="0 0 24 24" className="icon size-4">
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </Dialog.Close>
                  </div>
                  {children}
                </motion.div>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
