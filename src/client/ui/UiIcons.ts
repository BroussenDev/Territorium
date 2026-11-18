import { svg, SVGTemplateResult } from "lit";

/**
 * The menu icon language: 24px grid, 1.8 stroke, round caps and joins, one
 * small gold accent (`text-capital`) per icon that carries its meaning.
 *
 * Every home-page line icon (nav bars, account menu, links) draws from here so
 * weight, corner radius and optical size stay identical. `uiIconPaths` returns
 * the bare shapes for callers that already own the <svg> wrapper.
 */
const PATHS = {
  // Utility cluster.
  bell: svg`<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" class="text-capital" />`,
  help: svg`<circle cx="12" cy="12" r="9" />
    <path d="M9.2 9.2a2.9 2.9 0 0 1 5.6 1c0 1.9-2.8 2.4-2.8 4" />
    <path d="M12 17.6h.01" class="text-capital" />`,
  settings: svg`<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    <circle cx="12" cy="12" r="3" class="text-capital" />`,
  power: svg`<path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
    <path d="M12 3v8" class="text-capital" />`,
  megaphone: svg`<path d="M4 10v4l3 .5L15 19V5L7 9.5z" />
    <path d="M18 9.5a4 4 0 0 1 0 5" />
    <path d="M7 14.5 8.5 20h2.5l-1-4.7" />
    <path d="M20.5 4v3M19 5.5h3" class="text-capital" />`,
  bulb: svg`<path d="M9 18h6M10 21h4" />
    <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" />
    <path d="M12 7v3l1.5 1" class="text-capital" />`,

  // Nav tabs.
  play: svg`<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />`,
  modes: svg`<rect x="3" y="3" width="7.5" height="7.5" rx="2" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" class="text-capital" />`,
  store: svg`<path d="M6 3 3.5 7v11.5A2.5 2.5 0 0 0 6 21h12a2.5 2.5 0 0 0 2.5-2.5V7L18 3z" />
    <path d="M3.5 7h17" />
    <path d="M15.5 11a3.5 3.5 0 0 1-7 0" class="text-capital" />`,
  inventory: svg`<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    <path d="m3.3 7 8.7 5 8.7-5" />
    <path d="M12 21.6V12" class="text-capital" />`,
  leaderboard: svg`<path d="M7 4h10v6a5 5 0 0 1-10 0z" />
    <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />
    <path d="M12 15v3M8.5 20h7" class="text-capital" />`,
  tournaments: svg`<path d="M3 4h5v6H3M3 14h5v6H3M8 7h3v10H8M11 12h4" />
    <path d="M15 9h6v6h-6z" class="text-capital" />`,
  clans: svg`<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <path d="m9.2 11.6 2 2 3.6-3.8" class="text-capital" />`,

  // Account menu.
  user: svg`<path d="M20 21a8 8 0 0 0-16 0" />
    <circle cx="12" cy="9" r="4" class="text-capital" />`,
  share: svg`<circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" class="text-capital" />
    <circle cx="18" cy="19" r="3" />
    <path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" />`,
  tag: svg`<path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" />
    <path d="M7 7h.01" class="text-capital" />`,
  card: svg`<rect x="2" y="5" width="20" height="14" rx="3" />
    <path d="M2 10h20" class="text-capital" />`,
  history: svg`<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5" />
    <path d="M3.5 3.5v5h5" />
    <path d="M12 7.5V12l3 2" class="text-capital" />`,
  logout: svg`<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5M21 12H9" class="text-capital" />`,
} satisfies Record<string, SVGTemplateResult>;

export type UiIconId = keyof typeof PATHS;

export function uiIconPaths(id: UiIconId): SVGTemplateResult {
  return PATHS[id];
}

export function uiIcon(id: UiIconId, classes = "size-6"): SVGTemplateResult {
  return svg`<svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    class=${classes}
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >${PATHS[id]}</svg>`;
}
