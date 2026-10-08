import { html, nothing, svg, TemplateResult } from "lit";
import { translateText } from "../../Utils";

// The "Haut Commandant" badge of the Deluxe edition (Pack Conquérant): a
// crimson shield edged in gold, a star over three rank chevrons. Drawn on a
// 24-unit grid so it reads at name size.
export const HIGH_COMMANDER_SHAPES = svg`
  <path
    d="M12 1.6 20.6 4.8v6.4c0 5.2-3.6 9.6-8.6 11.2-5-1.6-8.6-6-8.6-11.2V4.8Z"
    fill="#e8b84a"
  ></path>
  <path
    d="M12 3.3 19 5.9v5.3c0 4.3-2.9 8-7 9.4-4.1-1.4-7-5.1-7-9.4V5.9Z"
    fill="#5e1120"
  ></path>
  <path
    d="m12 4.6 1.1 2.3 2.5.3-1.8 1.7.5 2.5L12 10.2l-2.3 1.2.5-2.5-1.8-1.7 2.5-.3Z"
    fill="#f2d27a"
  ></path>
  <path
    d="m7.6 12.6 4.4 2.4 4.4-2.4M7.6 15.2l4.4 2.4 4.4-2.4M8.4 17.7l3.6 2 3.6-2"
    fill="none"
    stroke="#e8b84a"
    stroke-width="1.3"
    stroke-linecap="round"
    stroke-linejoin="round"
  ></path>
`;

/** The badge next to a name. `label: null` hides it from screen readers. */
export function highCommanderBadge(
  sizeClass = "w-4 h-4",
  label?: string | null,
): TemplateResult {
  const text = label === undefined ? translateText("deluxe.badge") : label;
  return html`<svg
    viewBox="0 0 24 24"
    class="${sizeClass} shrink-0"
    data-high-commander-badge
    role=${text === null ? nothing : "img"}
    aria-hidden=${text === null ? "true" : nothing}
    aria-label=${text ?? nothing}
  >
    ${text === null
      ? nothing
      : svg`<title>${text}</title>`}${HIGH_COMMANDER_SHAPES}
  </svg>`;
}
