import { html, nothing, svg, TemplateResult } from "lit";
import { translateText } from "../../Utils";

// The "Pionnier" badge: a gold shield with a flag planted on an emerald
// hill, for the players who bought the Steam app during early access. Drawn
// on a 24-unit grid so it reads at name size; the reward screen draws the
// same shapes large.
export const PIONEER_SHAPES = svg`
  <path
    d="M12 1.6 20.6 4.8v6.4c0 5.2-3.6 9.6-8.6 11.2-5-1.6-8.6-6-8.6-11.2V4.8Z"
    fill="#e8b84a"
  ></path>
  <path
    d="M12 3.3 19 5.9v5.3c0 4.3-2.9 8-7 9.4-4.1-1.4-7-5.1-7-9.4V5.9Z"
    fill="#1b2f27"
  ></path>
  <path d="M5.3 15.6c2.2-2.6 4.4-3.6 6.7-3.6s4.5 1 6.7 3.6c-1.3 2.2-3.6 4-6.7 5-3.1-1-5.4-2.8-6.7-5Z" fill="#10b981"></path>
  <path d="M11.4 13.2V5.6" stroke="#f5e6b8" stroke-width="1.3" stroke-linecap="round"></path>
  <path d="M11.9 5.8h4.6l-1.3 1.7 1.3 1.7h-4.6Z" fill="#e8b84a"></path>
`;

/** The badge next to a name. `label: null` hides it from screen readers. */
export function pioneerBadge(
  sizeClass = "w-4 h-4",
  label?: string | null,
): TemplateResult {
  const text = label === undefined ? translateText("pioneer.badge") : label;
  return html`<svg
    viewBox="0 0 24 24"
    class="${sizeClass} shrink-0"
    data-pioneer-badge
    role=${text === null ? nothing : "img"}
    aria-hidden=${text === null ? "true" : nothing}
    aria-label=${text ?? nothing}
  >
    ${text === null ? nothing : svg`<title>${text}</title>`}${PIONEER_SHAPES}
  </svg>`;
}
