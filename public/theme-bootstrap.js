// Synchronous local preference prevents a bright flash before settings load.
try {
  const theme =
    localStorage.getItem("ecustudio:theme") === "obsidian"
      ? "obsidian"
      : "scholar";
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.backgroundColor =
    theme === "obsidian" ? "#090d13" : "#f3f6fc";
  document.documentElement.style.colorScheme =
    theme === "obsidian" ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "obsidian" ? "#090d13" : "#f3f6fc");
} catch {}
