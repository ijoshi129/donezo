export type ThemePref = "auto" | "light" | "dark";

const KEY = "donezo:theme";
const mql = window.matchMedia("(prefers-color-scheme: dark)");

export function getThemePref(): ThemePref {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : "auto";
}

function resolve(pref: ThemePref): boolean {
  return pref === "dark" || (pref === "auto" && mql.matches);
}

export function applyTheme(pref: ThemePref = getThemePref()): void {
  const dark = resolve(pref);
  document.documentElement.classList.toggle("dark", dark);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#16140f" : "#f4f1ea");
}

export function setThemePref(pref: ThemePref): void {
  if (pref === "auto") localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, pref);
  applyTheme(pref);
}

// Re-apply when the system theme flips while in "auto".
mql.addEventListener("change", () => {
  if (getThemePref() === "auto") applyTheme("auto");
});
