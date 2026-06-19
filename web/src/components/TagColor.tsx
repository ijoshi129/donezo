import { createContext, useContext, useMemo, type ReactNode } from "react";
import { autoIndex, dotClass, pillClass } from "../lib/tagcolor";

interface TagColor {
  /** Tailwind bg class for a tag's dot. */
  dot: (tag: string) => string;
  /** Tailwind soft-tinted pill classes (bg + text) for a tag. */
  pill: (tag: string) => string;
  /** Resolved palette index (override or auto). */
  index: (tag: string) => number;
}

const fallback: TagColor = {
  dot: (t) => dotClass(autoIndex(t)),
  pill: (t) => pillClass(autoIndex(t)),
  index: autoIndex,
};
const Ctx = createContext<TagColor>(fallback);

export function TagColorProvider({
  overrides,
  children,
}: {
  overrides: Record<string, number>;
  children: ReactNode;
}) {
  const value = useMemo<TagColor>(() => {
    const index = (tag: string) =>
      typeof overrides[tag] === "number" ? overrides[tag] : autoIndex(tag);
    return {
      index,
      dot: (tag) => dotClass(index(tag)),
      pill: (tag) => pillClass(index(tag)),
    };
  }, [overrides]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTagDot = () => useContext(Ctx).dot;
export const useTagPill = () => useContext(Ctx).pill;
export const useTagIndex = () => useContext(Ctx).index;
