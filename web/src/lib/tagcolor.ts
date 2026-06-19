// Tag color palette. A tag's color is its manual override if set, else a
// deterministic color from its name. Class strings are literal so Tailwind's
// content scan picks them up.
export const TAG_DOTS = [
  "bg-tag-0",
  "bg-tag-1",
  "bg-tag-2",
  "bg-tag-3",
  "bg-tag-4",
  "bg-tag-5",
  "bg-tag-6",
  "bg-tag-7",
];

export const TAG_COUNT = TAG_DOTS.length;

export function autoIndex(tag: string): number {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) | 0;
  return Math.abs(h) % TAG_COUNT;
}

export const dotClass = (i: number) => TAG_DOTS[((i % TAG_COUNT) + TAG_COUNT) % TAG_COUNT];
