import { html, nothing, svg, TemplateResult } from "lit";
import { translateText } from "../../Utils";

// The "Champion" badge of the last tournament's winners: a gold cup on an
// emerald roundel, laurels at its foot. Held until the next tournament
// crowns someone else (the API's tournaments.js). Drawn on a 24-unit grid so
// it reads at name size.
export const CHAMPION_SHAPES = svg`
  <circle cx="12" cy="12" r="10.6" fill="#f2c94c"></circle>
  <circle cx="12" cy="12" r="9.1" fill="#0f5c43"></circle>
  <path
    d="M8.2 6.2h7.6v2.6c0 2.5-1.6 4.4-3.8 4.8-2.2-.4-3.8-2.3-3.8-4.8Z"
    fill="#f2c94c"
  ></path>
  <path
    d="M8.2 7.3H6.6c0 1.9 1.1 3 2.4 3.3M15.8 7.3h1.6c0 1.9-1.1 3-2.4 3.3"
    fill="none"
    stroke="#f2c94c"
    stroke-width="1.1"
    stroke-linecap="round"
  ></path>
  <path d="M11.2 13.4h1.6v2.4h-1.6Z" fill="#f2c94c"></path>
  <path d="M9.2 15.8h5.6v1.6H9.2Z" fill="#f2c94c"></path>
  <path
    d="M5.6 13.6c.8 2.6 2.6 4.4 5 5M18.4 13.6c-.8 2.6-2.6 4.4-5 5"
    fill="none"
    stroke="#7fd1a8"
    stroke-width="1.1"
    stroke-linecap="round"
  ></path>
`;

/** The badge next to a name. `label: null` hides it from screen readers. */
export function championBadge(
  sizeClass = "w-4 h-4",
  label?: string | null,
): TemplateResult {
  const text =
    label === undefined ? translateText("tournaments.champion_badge") : label;
  return html`<svg
    viewBox="0 0 24 24"
    class="${sizeClass} shrink-0"
    data-champion-badge
    role=${text === null ? nothing : "img"}
    aria-hidden=${text === null ? "true" : nothing}
    aria-label=${text ?? nothing}
  >
    ${text === null ? nothing : svg`<title>${text}</title>`}${CHAMPION_SHAPES}
  </svg>`;
}
