// A subset of the colors Linguist's languages.yml assigns to common languages.
// Anything not listed here falls back to a deterministic hash-based color so
// rendering never fails on an unlisted language.
const KNOWN_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572A5",
  HTML: "#e34c26",
  CSS: "#563d7c",
  SCSS: "#c6538c",
  Astro: "#ff5a03",
  Shell: "#89e051",
  Dockerfile: "#384d54",
  Go: "#00ADD8",
  Rust: "#dea584",
  Java: "#b07219",
  "C": "#555555",
  "C++": "#f34b7d",
  "C#": "#178600",
  PHP: "#4F5D95",
  Ruby: "#701516",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  Lua: "#000080",
  Perl: "#0298c3",
  PowerShell: "#012456",
  Scheme: "#1e4aec",
  XSLT: "#EB8CEB",
  "T-SQL": "#e38c00",
  NSIS: "#7b5dbe",
  Markdown: "#083fa1",
  YAML: "#cb171e",
  JSON: "#292929",
  SQL: "#e38c00",
  Nix: "#7e7eff",
};

function hashColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 55%)`;
}

export function colorForLanguage(name: string): string {
  return KNOWN_COLORS[name] ?? hashColor(name);
}
