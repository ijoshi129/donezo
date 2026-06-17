import type { Priority } from "../types";

export const PRIORITY_LABEL: Record<Exclude<Priority, "none">, string> = {
  low: "Low",
  medium: "Med",
  high: "High",
};

// Soft tinted chip — same shape for every level, color = the level.
export const PRIORITY_SOFT: Record<Exclude<Priority, "none">, string> = {
  high: "bg-prio-high-soft text-prio-high",
  medium: "bg-prio-med-soft text-prio-med",
  low: "bg-prio-low-soft text-prio-low",
};

// Selected state in pickers (segmented control, dropdown). "none" is neutral.
export const PRIORITY_FILL: Record<Priority, string> = {
  none: "bg-sheet-2 text-ink",
  high: "bg-prio-high-soft text-prio-high",
  medium: "bg-prio-med-soft text-prio-med",
  low: "bg-prio-low-soft text-prio-low",
};

// Icon/text color only (composer flag button, dropdown flags).
export const PRIORITY_TEXT: Record<Priority, string> = {
  none: "text-ink-2",
  high: "text-prio-high",
  medium: "text-prio-med",
  low: "text-prio-low",
};
