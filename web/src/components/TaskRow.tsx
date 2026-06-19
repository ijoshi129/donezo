import { useRef, useState, type ReactNode } from "react";
import { motion, useMotionValue, useTransform, animate } from "motion/react";
import { useDrag } from "@use-gesture/react";
import type { Priority, Task } from "../types";
import { CheckIcon, FlagIcon, NoteIcon, PinIcon, TrashIcon } from "./icons";
import { PRIORITY_LABEL, PRIORITY_SOFT } from "../lib/priority";
import { tagDot } from "../lib/tagcolor";

interface Props {
  task: Task;
  onToggle: (task: Task) => void;
  onDelete: (task: Task) => void;
  onEdit: (task: Task) => void;
  onViewImage: (src: string) => void;
  onToggleTag: (tag: string) => void;
  onTogglePriority: (p: Priority) => void;
  activeTags: string[];
  activePriorities: Priority[];
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
  onDelete,
  onEdit,
  onViewImage,
  onToggleTag,
  onTogglePriority,
  activeTags,
  activePriorities,
  dragHandle,
}: Props) {
  const x = useMotionValue(0);
  const [dragging, setDragging] = useState(false);
  const moved = useRef(false); // distinguishes a swipe from a tap

  // The Done / Delete cues fade and grow as you pull toward each action.
  const completeOpacity = useTransform(x, [6, COMMIT * 0.7], [0, 1], { clamp: true });
  const completeScale = useTransform(x, [0, COMMIT, COMMIT * 1.5], [0.55, 1, 1.16], { clamp: true });
  const deleteOpacity = useTransform(x, [-6, -COMMIT * 0.7], [0, 1], { clamp: true });
  const deleteScale = useTransform(x, [0, -COMMIT, -COMMIT * 1.5], [0.55, 1, 1.16], { clamp: true });

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
        // Delete: fling the card off-screen, then remove it.
        if (mx < -COMMIT || (flick && dx < 0 && mx < -24)) {
          const off = -(window.innerWidth || 420);
          animate(x, off, { type: "tween", duration: 0.2, ease: [0.4, 0, 1, 1] }).then(
            () => onDelete(task),
          );
          return;
        }
        animate(x, 0, SETTLE);
      }
    },
    { axis: "x", filterTaps: true, pointer: { touch: true } },
  );

  return (
    <div className="relative border-b-[1.5px] border-hair last:border-b-0">
      {/* swipe action layers (icons/labels animate with pull distance) */}
      <div className="absolute inset-0 flex">
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
            style={{ opacity: deleteOpacity, scale: deleteScale }}
            className="label-mono flex items-center gap-2 !text-paper"
          >
            Delete
            <TrashIcon className="icon size-[17px]" />
          </motion.span>
        </div>
      </div>

      <motion.div
        {...(bind() as Record<string, unknown>)}
        style={{ x, touchAction: "pan-y" }}
        className={`relative flex touch-pan-y items-start gap-3 bg-paper px-1.5 py-[15px] select-none ${
          dragging ? "shadow-[0_8px_24px_-12px_rgba(0,0,0,0.35)]" : ""
        }`}
      >
        <button
          onClick={() => !dragging && onToggle(task)}
          aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
          className={`mt-px grid size-[22px] shrink-0 place-items-center rounded-full border-2 border-ink transition-colors duration-200 hover:bg-acid ${
            task.completed ? "bg-ink text-acid" : "text-transparent"
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
            className={`m-0 font-display text-base font-semibold tracking-tight transition-colors duration-200 ${
              task.completed ? "text-ink-3 line-through" : "text-ink"
            }`}
          >
            {task.pinned && (
              <PinIcon className="icon mr-1.5 inline size-3.5 align-[-2px] text-acid-deep" />
            )}
            {task.title}
          </p>

          {(task.tags.length > 0 ||
            (task.priority && task.priority !== "none") ||
            !!task.notes) && (
            <div
              className={`mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 font-mono text-[11px] text-ink-2 ${
                task.completed ? "opacity-50" : ""
              }`}
            >
              {task.priority && task.priority !== "none" && (
                <button
                  type="button"
                  title="Filter by priority"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePriority(task.priority);
                  }}
                  className={`inline-flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 font-semibold ${PRIORITY_SOFT[task.priority]} ${
                    activePriorities.includes(task.priority)
                      ? "ring-2 ring-ink ring-inset"
                      : ""
                  }`}
                >
                  <FlagIcon className="icon size-3" />
                  {PRIORITY_LABEL[task.priority]}
                </button>
              )}

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
                    className={`inline-flex items-center gap-1 ${
                      on ? "font-semibold text-ink" : "text-ink-2"
                    }`}
                  >
                    <span className={`size-[7px] rounded-full ${tagDot(tag)}`} />
                    {tag}
                  </button>
                );
              })}

              {task.notes && (
                <span className="inline-flex" title="Has notes">
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
