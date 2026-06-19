import { createContext, useContext, useMemo, type ReactNode } from "react";
import { autoIndex, dotClass } from "../lib/tagcolor";

interface TagColor {
  /** Tailwind bg class for a tag's dot. */
  dot: (tag: string) => string;
  /** Resolved palette index (override or auto). */
  index: (tag: string) => number;
}

const fallback: TagColor = {
  dot: (t) => dotClass(autoIndex(t)),
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
    return { index, dot: (tag) => dotClass(index(tag)) };
  }, [overrides]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTagDot = () => useContext(Ctx).dot;
export const useTagIndex = () => useContext(Ctx).index;
