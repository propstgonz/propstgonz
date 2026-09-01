export type ThemeName = "dark" | "light";

export type Theme = {
  background: string;
  title: string;
  accent: string;
  text: string;
  stroke: string;
};

const FONT_STACK =
  'system-ui, -apple-system, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif';

// The palette already in use across the existing README widgets.
const THEMES: Record<ThemeName, Theme> = {
  dark: {
    background: "transparent",
    title: "#f2c35c",
    accent: "#a67b40",
    text: "#88ab98",
    stroke: "#678079",
  },
  light: {
    background: "#ffffff",
    title: "#a67b40",
    accent: "#a67b40",
    text: "#2f3a35",
    stroke: "#678079",
  },
};

export function themeFor(name: ThemeName): Theme {
  return THEMES[name];
}

export function fontStack(): string {
  return FONT_STACK;
}
