export type Theme = "dark" | "light";

const STORAGE_KEY = "musicml.theme";

export function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const saved = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
  if (saved === "dark" || saved === "light") return saved;
  return "dark";
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {}
}
