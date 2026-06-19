import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task } from "../types";
import { TaskRow } from "./TaskRow";

interface Props {
  task: Task;
  onToggle: (task: Task) => void;
  onTogglePin: (task: Task) => void;
  onEdit: (task: Task) => void;
  onViewImage: (src: string) => void;
  onToggleTag: (tag: string) => void;
  activeTags: string[];
}

export function SortableTask(props: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.task.id });

  // The whole card is the drag activator (press-and-hold). Listeners live on the
  // wrapper so they coexist with TaskRow's inner swipe gesture rather than
  // overriding its pointer handlers.
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 30 : undefined,
      }}
      className={
        isDragging
          ? "relative cursor-grabbing opacity-95 shadow-hard-sm"
          : "relative cursor-grab"
      }
    >
      <TaskRow {...props} reordering={isDragging} />
    </div>
  );
}
