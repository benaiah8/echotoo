export type Theme = "dark" | "light";
const KEY = "theme";

export function getInitialTheme(): Theme {
  const saved = localStorage.getItem(KEY) as Theme | null;
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "light") root.classList.add("theme-light");
  else root.classList.remove("theme-light");
  localStorage.setItem(KEY, theme);
}

export function toggleTheme(): Theme {
  const next = (
    localStorage.getItem(KEY) === "light" ? "dark" : "light"
  ) as Theme;
  applyTheme(next);
  return next;
}
