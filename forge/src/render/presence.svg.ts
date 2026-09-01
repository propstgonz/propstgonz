import { fontStack, themeFor, type ThemeName } from "../lib/theme.js";
import type { Presence } from "../presence/gateway.js";

const WIDTH = 360;
const HEIGHT = 90;
const MAX_BADGES = 5;

const STATUS_COLOR: Record<Presence["status"], string> = {
  online: "#3ba55d",
  idle: "#faa61a",
  dnd: "#ed4245",
  invisible: "#80848e",
  offline: "#80848e",
  unknown: "#5c6a76",
};

const STATUS_LABEL: Record<Presence["status"], string> = {
  online: "Online",
  idle: "Idle",
  dnd: "Do Not Disturb",
  invisible: "Offline",
  offline: "Offline",
  unknown: "Unknown",
};

/**
 * The widget never lies: an "unknown" status (stale gateway) renders visibly
 * as unknown rather than being coerced into "offline".
 */
export function renderPresenceSvg(presence: Presence, themeName: ThemeName): string {
  const theme = themeFor(themeName);
  const statusColor = STATUS_COLOR[presence.status];
  const statusLabel = STATUS_LABEL[presence.status];
  const avatarR = 28;
  const avatarCx = 46;
  const avatarCy = HEIGHT / 2;

  const avatar = presence.avatarDataUri
    ? `<clipPath id="avatar-clip"><circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR}" /></clipPath>
       <image href="${presence.avatarDataUri}" x="${avatarCx - avatarR}" y="${avatarCy - avatarR}" width="${avatarR * 2}" height="${avatarR * 2}" clip-path="url(#avatar-clip)" />`
    : `<circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR}" fill="${theme.stroke}" opacity="0.3" />`;

  const badgeSize = 16;
  const badgeGap = 4;
  const shownBadges = presence.badges.slice(0, MAX_BADGES);
  const badgesWidth = shownBadges.length * (badgeSize + badgeGap) - badgeGap;
  const badges = shownBadges
    .map((uri, i) => {
      const x = WIDTH - 14 - badgesWidth + i * (badgeSize + badgeGap);
      return `<image href="${uri}" x="${x}" y="14" width="${badgeSize}" height="${badgeSize}" />`;
    })
    .join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" font-family='${fontStack()}'>
  <rect width="${WIDTH}" height="${HEIGHT}" rx="10" fill="${theme.background}" stroke="${theme.stroke}" stroke-opacity="0.25" />
  ${avatar}
  ${badges}
  <circle cx="${avatarCx + avatarR - 6}" cy="${avatarCy + avatarR - 6}" r="8" fill="${theme.background === "transparent" ? "#1e1f22" : theme.background}" />
  <circle cx="${avatarCx + avatarR - 6}" cy="${avatarCy + avatarR - 6}" r="5.5" fill="${statusColor}" />
  <text x="88" y="${HEIGHT / 2 - 10}" fill="${theme.title}" font-size="16" font-weight="700">${escapeXml(presence.displayName)}</text>
  <text x="88" y="${HEIGHT / 2 + 10}" fill="${statusColor}" font-size="12" font-weight="600">${statusLabel}</text>
  <text x="88" y="${HEIGHT / 2 + 28}" fill="${theme.text}" font-size="11" opacity="0.85">${escapeXml(presence.activity ?? "")}</text>
</svg>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
