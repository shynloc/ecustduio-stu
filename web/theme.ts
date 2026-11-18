export type Theme = "scholar" | "obsidian";
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.backgroundColor =
    theme === "obsidian" ? "#090d13" : "#f6f5f1";
  document.documentElement.style.colorScheme =
    theme === "obsidian" ? "dark" : "light";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "obsidian" ? "#090d13" : "#23483d");
  try {
    localStorage.setItem("ecustudio:theme", theme);
  } catch {}
}
