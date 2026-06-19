import { Modal } from "./Modal";
import { useTagDot } from "./TagColor";

interface Props {
  open: boolean;
  onClose: () => void;
  allTags: string[];
  tagFilters: string[];
  onToggleTag: (tag: string) => void;
  onClear: () => void;
}

export function FilterModal({
  open,
  onClose,
  allTags,
  tagFilters,
  onToggleTag,
  onClear,
}: Props) {
  const any = tagFilters.length > 0;
  const tagDot = useTagDot();

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title="Filter">
      <div className="flex flex-col gap-5">
        <section>
          <span className="label-mono mb-2.5 block">Tags</span>
          {allTags.length === 0 ? (
            <p className="font-mono text-xs text-ink-3">No tags yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allTags.map((tag) => {
                const on = tagFilters.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => onToggleTag(tag)}
                    className={`inline-flex items-center gap-1.5 rounded-md border-[1.5px] px-2.5 py-1.5 font-mono text-xs ${
                      on
                        ? "border-ink bg-sheet-2 font-semibold text-ink"
                        : "border-hair text-ink-2"
                    }`}
                  >
                    <span className={`size-[7px] rounded-full ${tagDot(tag)}`} />
                    {tag}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <div className="mt-1 flex gap-3">
          <button
            type="button"
            onClick={onClear}
            disabled={!any}
            className="flex-1 rounded-md border-[1.8px] border-ink py-3 font-display text-sm font-semibold text-ink disabled:opacity-40"
          >
            Clear all
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-md border-[1.8px] border-ink bg-acid py-3 font-display text-sm font-semibold text-on-acid shadow-hard-sm active:translate-y-0.5"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
