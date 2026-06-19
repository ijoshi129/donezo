import { useRef, useState, type ReactNode } from "react";
import { motion, useMotionValue, useTransform, animate } from "motion/react";
import { useDrag } from "@use-gesture/react";
import type { Task } from "../types";
import { CheckIcon, NoteIcon, PinIcon } from "./icons";
import { useTagPill } from "./TagColor";

interface Props {
  task: Task;
  onToggle: (task: Task) => void;
  onTogglePin: (task: Task) => void;
  onEdit: (task: Task) => void;
  onViewImage: (src: string) => void;
  onToggleTag: (tag: string) => void;
  activeTags: string[];
  dragHandle?: ReactNode; // reorder grip (open tasks only)
}

const COMMIT = 82; // px past which a swipe fires its action
const FLICK = 0.5; // px/ms — a fast flick commits even below COMMIT
const SETTLE = { type: "spring", stiffness: 420, damping: 34, mass: 0.85 } as const;

// Beyond the commit point the card keeps moving but with growing resistance,
// so the swipe feels elastic instead of running away.
function resist(mx: number) {
  const a = Math.abs(mx);
  if (a <= COMMIT) return mx;
  return Math.sign(mx) * (COMMIT + (a - COMMIT) * 0.42);
}

export function TaskRow({
  task,
  onToggle,
  onTogglePin,
  onEdit,
  onViewImage,
  onToggleTag,
  activeTags,
  dragHandle,
}: Props) {
  const x = useMotionValue(0);
  const [dragging, setDragging] = useState(false);
  const moved = useRef(false); // distinguishes a swipe from a tap
  const tagPill = useTagPill();

  // The Done / Pin cues fade and grow as you pull toward each action.
  const completeOpacity = useTransform(x, [6, COMMIT * 0.7], [0, 1], { clamp: true });
  const completeScale = useTransform(x, [0, COMMIT, COMMIT * 1.5], [0.55, 1, 1.16], { clamp: true });
  const pinOpacity = useTransform(x, [-6, -COMMIT * 0.7], [0, 1], { clamp: true });
  const pinScale = useTransform(x, [0, -COMMIT, -COMMIT * 1.5], [0.55, 1, 1.16], { clamp: true });

  const bind = useDrag(
    ({ down, movement: [mx], velocity: [vx], direction: [dx], last, event }) => {
      // Ignore swipes that begin on the reorder handle — that's dnd-kit's job.
      if (
        down &&
        !moved.current &&
        (event?.target as HTMLElement | null)?.closest("[data-drag-handle]")
      ) {
        return;
      }
      setDragging(down);
      if (down) {
        if (Math.abs(mx) > 6) moved.current = true;
        x.set(resist(mx));
        return;
      }
      if (last) {
        const flick = vx > FLICK;
        // Complete: toggle right away (optimistic) and settle back into place;
        // the row re-renders into the Done section already at rest.
        if (mx > COMMIT || (flick && dx > 0 && mx > 24)) {
          onToggle(task);
          animate(x, 0, SETTLE);
          return;
        }
        // Pin / unpin: toggle and settle back — the task stays in place.
        if (mx < -COMMIT || (flick && dx < 0 && mx < -24)) {
          onTogglePin(task);
          animate(x, 0, SETTLE);
          return;
        }
        animate(x, 0, SETTLE);
      }
    },
    { axis: "x", filterTaps: true, pointer: { touch: true } },
  );

  const done = task.completed;

  return (
    <div className="relative">
      {/* swipe action layers — sit behind the card, revealed as it slides */}
      <div className="absolute inset-0 flex overflow-hidden rounded-[14px]">
        <div className="flex flex-1 items-center justify-start bg-acid px-[18px]">
          <motion.span
            style={{ opacity: completeOpacity, scale: completeScale }}
            className="label-mono flex items-center gap-2 !text-on-acid"
          >
            <CheckIcon className="icon size-[17px]" />
            Done
          </motion.span>
        </div>
        <div className="flex flex-1 items-center justify-end bg-ink px-[18px]">
          <motion.span
            style={{ opacity: pinOpacity, scale: pinScale }}
            className="label-mono flex items-center gap-2 !text-acid-deep"
          >
            {task.pinned ? "Unpin" : "Pin"}
            <PinIcon className="icon size-[17px]" />
          </motion.span>
        </div>
      </div>

      <motion.div
        {...(bind() as Record<string, unknown>)}
        style={{ x, touchAction: "pan-y" }}
        className={`relative flex touch-pan-y select-none items-start gap-3 rounded-[14px] border-[1.6px] py-[13px] pr-3.5 ${
          done
            ? "border-hair-2 bg-sheet-2"
            : "border-ink bg-sheet shadow-[2px_2px_0_var(--edge)]"
        } ${task.pinned && !done ? "pl-[14px]" : "pl-3.5"} ${
          dragging ? "shadow-[0_8px_24px_-12px_rgba(0,0,0,0.35)]" : ""
        }`}
      >
        {/* acid edge marks a pinned task at a glance */}
        {task.pinned && !done && (
          <span className="absolute top-2 bottom-2 left-0 w-1 rounded-full bg-acid-deep" />
        )}

        <button
          onClick={() => !dragging && onToggle(task)}
          aria-label={done ? "Mark incomplete" : "Mark complete"}
          className={`mt-px grid size-[22px] shrink-0 place-items-center rounded-full border-2 border-ink transition-colors duration-200 hover:bg-acid ${
            done ? "bg-ink text-acid-deep" : "text-transparent"
          }`}
        >
          <CheckIcon className="icon size-3" strokeWidth={3} />
        </button>

        <div
          className="min-w-0 flex-1 cursor-pointer"
          onClick={() => {
            if (moved.current) {
              moved.current = false;
              return;
            }
            onEdit(task);
          }}
        >
          <p
            className={`m-0 font-display text-[16.5px] font-[650] leading-[1.18] tracking-tight transition-colors duration-200 ${
              done ? "text-ink-3 line-through" : "text-ink"
            }`}
          >
            {task.pinned && (
              <PinIcon className="icon mr-1.5 inline size-3.5 align-[-2px] text-acid-deep" />
            )}
            {task.title}
          </p>

          {(task.tags.length > 0 || !!task.notes) && (
            <div
              className={`mt-2 flex flex-wrap items-center gap-1.5 ${
                done ? "opacity-50" : ""
              }`}
            >
              {task.tags.map((tag) => {
                const on = activeTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    title="Filter by tag"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleTag(tag);
                    }}
                    className={`rounded-md px-2 py-0.5 font-display text-[11px] font-semibold leading-[1.4] ${tagPill(
                      tag,
                    )} ${on ? "ring-[1.5px] ring-ink ring-inset" : ""}`}
                  >
                    {tag}
                  </button>
                );
              })}

              {task.notes && (
                <span className="inline-flex text-ink-3" title="Has notes">
                  <NoteIcon className="icon size-3.5" />
                </span>
              )}
            </div>
          )}
        </div>

        {task.image && (
          <button
            type="button"
            onClick={() => {
              if (moved.current) {
                moved.current = false;
                return;
              }
              onViewImage(task.image!);
            }}
            aria-label="View image"
            className="shrink-0"
          >
            <img
              src={task.image}
              alt=""
              className="size-11 rounded border-[1.8px] border-ink object-cover"
            />
          </button>
        )}

        {dragHandle}
      </motion.div>
    </div>
  );
}
