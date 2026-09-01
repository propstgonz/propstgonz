import type { StreakSummary } from "../collect/streaks.js";
import { fontStack, themeFor, type ThemeName } from "../lib/theme.js";

const WIDTH = 495;
const HEIGHT = 195;

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function rangeLabel(range: { from: string; to: string } | null, presentIfToday: boolean): string {
  if (!range) return "—";
  const from = formatDate(range.from);
  const today = new Date().toLocaleDateString("en-CA");
  const to = presentIfToday && range.to === today ? "Present" : formatDate(range.to);
  return `${from} - ${to}`;
}

/**
 * Three-column layout matching the reference streak widget: total on the
 * left, a ring with the current streak in the center, longest streak on the
 * right, each with its date range underneath.
 */
export function renderStreakSvg(summary: StreakSummary, themeName: ThemeName): string {
  const theme = themeFor(themeName);
  const colWidth = WIDTH / 3;
  const centerX = WIDTH / 2;
  const ringY = 75;
  const ringR = 46;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" font-family='${fontStack()}' text-anchor="middle">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${theme.background}" />

  <g>
    <text x="${colWidth / 2}" y="70" fill="${theme.text}" font-size="28" font-weight="700">${summary.totalContributions.toLocaleString("en-US")}</text>
    <text x="${colWidth / 2}" y="95" fill="${theme.accent}" font-size="13">Total Contributions</text>
    <text x="${colWidth / 2}" y="115" fill="${theme.text}" font-size="11" opacity="0.8">${rangeLabel(summary.totalRange, true)}</text>
  </g>

  <line x1="${colWidth}" y1="20" x2="${colWidth}" y2="${HEIGHT - 20}" stroke="${theme.stroke}" stroke-opacity="0.4" />
  <line x1="${colWidth * 2}" y1="20" x2="${colWidth * 2}" y2="${HEIGHT - 20}" stroke="${theme.stroke}" stroke-opacity="0.4" />

  <g>
    <circle cx="${centerX}" cy="${ringY}" r="${ringR}" fill="none" stroke="${theme.stroke}" stroke-opacity="0.25" stroke-width="4" />
    <circle cx="${centerX}" cy="${ringY}" r="${ringR}" fill="none" stroke="${theme.accent}" stroke-width="4"
      stroke-dasharray="${2 * Math.PI * ringR}" stroke-dashoffset="${summary.currentStreak > 0 ? 0 : 2 * Math.PI * ringR}"
      stroke-linecap="round" transform="rotate(-90 ${centerX} ${ringY})" />
    <text x="${centerX}" y="${ringY + 8}" fill="${theme.text}" font-size="26" font-weight="700">${summary.currentStreak}</text>
    <text x="${centerX}" y="145" fill="${theme.accent}" font-size="13" font-weight="600">Current Streak</text>
    <text x="${centerX}" y="163" fill="${theme.text}" font-size="11" opacity="0.8">${rangeLabel(summary.currentStreakRange, false)}</text>
  </g>

  <g>
    <text x="${colWidth * 2 + colWidth / 2}" y="70" fill="${theme.text}" font-size="28" font-weight="700">${summary.longestStreak}</text>
    <text x="${colWidth * 2 + colWidth / 2}" y="95" fill="${theme.accent}" font-size="13">Longest Streak</text>
    <text x="${colWidth * 2 + colWidth / 2}" y="115" fill="${theme.text}" font-size="11" opacity="0.8">${rangeLabel(summary.longestStreakRange, false)}</text>
  </g>
</svg>`;
}
