// Synchronous local preference prevents a bright flash before settings load.
try {
  const theme =
    localStorage.getItem("ecustudio:theme") === "obsidian"
      ? "obsidian"
      : "scholar";
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.backgroundColor =
    theme === "obsidian" ? "#090d13" : "#f6f5f1";
  document.documentElement.style.colorScheme =
    theme === "obsidian" ? "dark" : "light";
} catch {}
