import { svg, TemplateResult } from "lit";

/**
 * Line icons of the in-game menu, drawn on a 24px grid with `currentColor` so
 * a row can tint them on hover. Rounded caps and joins, like the rest of the
 * HUD's glyphs.
 */
const icon = (paths: TemplateResult, size = 20) =>
  svg`<svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width=${size}
    height=${size}
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >${paths}</svg>`;

/** A territory cell: the menu's own mark. */
export const menuHexIcon = (size?: number) =>
  icon(
    svg`<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z" /><circle cx="12" cy="12" r="2.6" />`,
    size,
  );

/** Two sliders: settings. */
export const menuSlidersIcon = (size?: number) =>
  icon(
    svg`<path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" />`,
    size,
  );

/** A ridge under a sun: the terrain view. */
export const menuTerrainIcon = (size?: number) =>
  icon(
    svg`<path d="M3 19l6-10 4 6 2-3 6 7z" /><circle cx="17.5" cy="6" r="1.6" />`,
    size,
  );

/** A beetle: report a bug. */
export const menuBugIcon = (size?: number) =>
  icon(
    svg`<rect x="8" y="8" width="8" height="11" rx="4" /><path d="M9.2 8a2.8 2.8 0 0 1 5.6 0M12 10v9M8 12.5H4M16 12.5h4M8.4 16.6 5 18.4M15.6 16.6 19 18.4M8.4 9.6 5.6 8M15.6 9.6 18.4 8" />`,
    size,
  );

/** Angle brackets: development tools. */
export const menuCodeIcon = (size?: number) =>
  icon(svg`<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" />`, size);

/** A door with an arrow: leave the game. */
export const menuExitIcon = (size?: number) =>
  icon(
    svg`<path d="M10 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20H10M15 8l4 4-4 4M19 12H9.5" />`,
    size,
  );

export const menuChevronIcon = (size = 16) =>
  icon(svg`<path d="M9 6l6 6-6 6" />`, size);

export const menuCloseIcon = (size = 18) =>
  icon(svg`<path d="M6 6l12 12M18 6L6 18" />`, size);
