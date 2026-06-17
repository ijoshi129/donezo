import type { Priority } from "../types";

// Pull "#tag" and "!priority" tokens out of free text. A token only counts at a
// word boundary (start or after whitespace) so "C#" or "done!" aren't matched.
const TAG_RE = /(^|\s)#([a-z0-9][a-z0-9_-]*)/gi;
const PRIO_RE = /(^|\s)!(high|hi|medium|med|low|lo)\b/gi;

type RealPriority = Exclude<Priority, "none">;

const PRIO_MAP: Record<string, RealPriority> = {
  high: "high",
  hi: "high",
  medium: "medium",
  med: "medium",
  low: "low",
  lo: "low",
};

export interface ParsedInput {
  title: string;
  tags: string[];
  priority: RealPriority | null; // null => not specified in the text
}

export function parseInput(raw: string): ParsedInput {
  let priority: RealPriority | null = null;
  let s = raw.replace(PRIO_RE, (_m, pre, word) => {
    priority = PRIO_MAP[word.toLowerCase()]; // last one wins
    return pre;
  });

  const tags: string[] = [];
  s = s.replace(TAG_RE, (_m, pre, tag) => {
    tags.push(tag.toLowerCase().slice(0, 24));
    return pre;
  });

  const title = s.replace(/\s+/g, " ").trim();
  return { title, tags: [...new Set(tags)].slice(0, 8), priority };
}
