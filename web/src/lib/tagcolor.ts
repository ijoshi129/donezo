// Deterministically map a tag name to one of the palette colors, so a tag is
// always the same color everywhere it appears (no per-tag config needed).

// Class strings are literal so Tailwind's content scan picks them up.
const DOT = [
  "bg-tag-0",
  "bg-tag-1",
  "bg-tag-2",
  "bg-tag-3",
  "bg-tag-4",
  "bg-tag-5",
  "bg-tag-6",
  "bg-tag-7",
];

function tagIndex(tag: string): number {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) | 0;
  return Math.abs(h) % DOT.length;
}

export const tagDot = (tag: string) => DOT[tagIndex(tag)];
