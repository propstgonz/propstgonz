import type { LanguagesState } from "../collect/languages.js";
import { fontStack, themeFor, type ThemeName } from "../lib/theme.js";
import { colorForLanguage } from "./language-colors.js";

const WIDTH = 480;
const BAR_HEIGHT = 12;
const OTHER_THRESHOLD_PCT = 0.5;

type Segment = { name: string; pct: number; color: string };

function buildSegments(bytesByLanguage: Record<string, number>): Segment[] {
  const total = Object.values(bytesByLanguage).reduce((a, b) => a + b, 0);
  if (total === 0) return [];

  const all = Object.entries(bytesByLanguage)
    .map(([name, bytes]) => ({ name, pct: (bytes / total) * 100, color: colorForLanguage(name) }))
    .sort((a, b) => b.pct - a.pct);

  const major = all.filter((s) => s.pct >= OTHER_THRESHOLD_PCT);
  const otherPct = all.filter((s) => s.pct < OTHER_THRESHOLD_PCT).reduce((a, s) => a + s.pct, 0);
  if (otherPct > 0) major.push({ name: "Other", pct: otherPct, color: "#6e7681" });
  return major;
}

/**
 * Renders the same stacked, rounded-corner language bar GitHub shows on a
 * single repository, aggregated across every owned, non-fork, non-archived
 * repository. This is a pure function: no I/O, no clock reads besides what's
 * already baked into `computedAt`.
 */
export function renderLanguagesSvg(state: LanguagesState, themeName: ThemeName): string {
  const theme = themeFor(themeName);
  const segments = buildSegments(state.bytesByLanguage);
  const legendCols = 2;
  const legendRows = Math.ceil(segments.length / legendCols);
  const legendRowHeight = 22;
  const height = 56 + legendRows * legendRowHeight;
  const colWidth = (WIDTH - 20) / legendCols;

  let x = 10;
  const barY = 30;
  const barSegments = segments
    .map((s) => {
      const w = ((WIDTH - 20) * s.pct) / 100;
      const rect = `<rect x="${x.toFixed(2)}" y="${barY}" width="${w.toFixed(2)}" height="${BAR_HEIGHT}" fill="${s.color}"><title>${escapeXml(s.name)} ${s.pct.toFixed(1)}%</title></rect>`;
      x += w;
      return rect;
    })
    .join("");

  const legendItems = segments
    .map((s, i) => {
      const col = i % legendCols;
      const row = Math.floor(i / legendCols);
      const lx = 10 + col * colWidth;
      const ly = barY + BAR_HEIGHT + 24 + row * legendRowHeight;
      return `
        <circle cx="${lx + 5}" cy="${ly - 4}" r="5" fill="${s.color}" />
        <text x="${lx + 16}" y="${ly}" fill="${theme.text}" font-size="13">${escapeXml(s.name)} <tspan fill="${theme.accent}">${s.pct.toFixed(1)}%</tspan></text>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" font-family='${fontStack()}'>
  <rect width="${WIDTH}" height="${height}" fill="${theme.background}" />
  <text x="10" y="18" fill="${theme.title}" font-size="15" font-weight="600">Most Used Languages</text>
  <rect x="10" y="${barY}" width="${WIDTH - 20}" height="${BAR_HEIGHT}" rx="${BAR_HEIGHT / 2}" fill="${theme.stroke}" opacity="0.15" />
  <clipPath id="bar-clip"><rect x="10" y="${barY}" width="${WIDTH - 20}" height="${BAR_HEIGHT}" rx="${BAR_HEIGHT / 2}" /></clipPath>
  <g clip-path="url(#bar-clip)">${barSegments}</g>
  ${legendItems}
</svg>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
