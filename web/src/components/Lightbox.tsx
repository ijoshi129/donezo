import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "motion/react";

interface Props {
  src: string | null;
  onClose: () => void;
}

export function Lightbox({ src, onClose }: Props) {
  return (
    <Dialog.Root open={!!src} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence>
        {src && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-[60] bg-ink/80 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              aria-describedby={undefined}
              aria-label="Task image"
            >
              <motion.div
                className="fixed inset-0 z-[70] grid place-items-center p-6"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                onClick={onClose}
              >
                <Dialog.Title className="sr-only">Task image</Dialog.Title>
                <img
                  src={src}
                  alt=""
                  className="max-h-full max-w-full rounded-lg border-2 border-paper object-contain shadow-[8px_8px_0_rgba(0,0,0,0.5)]"
                />
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
