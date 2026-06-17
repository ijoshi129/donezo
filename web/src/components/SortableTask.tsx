import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Priority, Task } from "../types";
import { TaskRow } from "./TaskRow";

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
}

export function SortableTask(props: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.task.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 30 : undefined,
      }}
      className={isDragging ? "relative opacity-95 shadow-hard-sm" : "relative"}
    >
      <TaskRow
        {...props}
        dragHandle={
          <button
            data-drag-handle
            aria-label="Drag to reorder"
            {...attributes}
            {...listeners}
            className="mt-0.5 grid size-7 shrink-0 cursor-grab touch-none place-items-center self-center rounded text-ink-3 hover:text-ink active:cursor-grabbing"
          >
            <svg viewBox="0 0 24 24" className="size-[18px]" fill="currentColor">
              <circle cx="9" cy="6" r="1.4" />
              <circle cx="9" cy="12" r="1.4" />
              <circle cx="9" cy="18" r="1.4" />
              <circle cx="15" cy="6" r="1.4" />
              <circle cx="15" cy="12" r="1.4" />
              <circle cx="15" cy="18" r="1.4" />
            </svg>
          </button>
        }
      />
    </div>
  );
}
