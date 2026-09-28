import { css, html, LitElement, svg } from "lit";
import { customElement, property } from "lit/decorators.js";
import {
  type ClanCrest,
  CREST_COLORS,
  crestOf,
  type CrestShape,
  type CrestSymbol,
} from "../../../core/ClanCrest";

// Outlines in a 100×110 box, with where the symbol sits and how big it is.
const SHAPES: Record<
  CrestShape,
  { outline: ReturnType<typeof svg>; cy: number; size: number }
> = {
  shield: {
    outline: svg`<path d="M10 8 Q10 4 14 4 H86 Q90 4 90 8 V60 C90 84 70 98 50 106 C30 98 10 84 10 60 Z" />`,
    cy: 50,
    size: 50,
  },
  heater: {
    outline: svg`<path d="M6 10 Q50 -2 94 10 V44 C94 74 74 96 50 106 C26 96 6 74 6 44 Z" />`,
    cy: 48,
    size: 50,
  },
  round: {
    outline: svg`<circle cx="50" cy="55" r="47" />`,
    cy: 55,
    size: 52,
  },
  banner: {
    outline: svg`<path d="M14 4 H86 V104 L50 84 L14 104 Z" />`,
    cy: 44,
    size: 48,
  },
  diamond: {
    outline: svg`<path d="M50 3 L97 55 L50 107 L3 55 Z" />`,
    cy: 55,
    size: 40,
  },
};

// Symbols drawn in a 24×24 box with currentColor.
const SYMBOLS: Record<
  Exclude<CrestSymbol, "letter">,
  ReturnType<typeof svg>
> = {
  crown: svg`<path d="M3 18 L5 7 L9.5 11.5 L12 5 L14.5 11.5 L19 7 L21 18 Z M3 19.5 H21 V21.5 H3 Z" />`,
  star: svg`<path d="M12 2 L14.9 8.6 L22 9.3 L16.6 14 L18.2 21 L12 17.3 L5.8 21 L7.4 14 L2 9.3 L9.1 8.6 Z" />`,
  swords: svg`<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
      <path d="M4 4 L15 15 M20 4 L9 15 M13 17 L17 13 M7 13 L11 17 M15 15 L19.5 19.5 M9 15 L4.5 19.5" />
    </g>`,
  tower: svg`<path fill-rule="evenodd" d="M5 3 H8 V5 H10.5 V3 H13.5 V5 H16 V3 H19 V9 L17 11 V21 H7 V11 L5 9 Z M10.5 21 V16.5 A1.5 1.5 0 0 1 13.5 16.5 V21 Z" />`,
  flame: svg`<path d="M12 2 C13 6 18 8.5 18 14 A6 6 0 0 1 6 14 C6 10.5 8.5 9 9 6 C10.5 8 11 9.5 11 11 C12.5 9.5 12.8 5.5 12 2 Z" />`,
  anchor: svg`<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
      <circle cx="12" cy="4.5" r="2" />
      <path d="M12 6.5 V21 M8 10 H16 M4 13 Q4 21 12 21 Q20 21 20 13" />
    </g>`,
  bolt: svg`<path d="M13 2 L4 14 H11 L10 22 L20 9 H13 Z" />`,
  moon: svg`<path d="M20 15.5 A8.5 8.5 0 1 1 10.5 3 A7 7 0 0 0 20 15.5 Z" />`,
  mountain: svg`<path d="M2 20 L9 8 L12.5 13 L15.5 9 L22 20 Z" />`,
  sun: svg`<circle cx="12" cy="12" r="4.5" />
      <g stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M12 2 V4.5 M12 19.5 V22 M2 12 H4.5 M19.5 12 H22 M4.9 4.9 L6.7 6.7 M17.3 17.3 L19.1 19.1 M4.9 19.1 L6.7 17.3 M17.3 6.7 L19.1 4.9" />
      </g>`,
  tree: svg`<path d="M12 2 L18 10 H15 L20 16 H13.5 V21 H10.5 V16 H4 L9 10 H6 Z" />`,
  cross: svg`<path d="M9.5 2 H14.5 V9.5 H22 V14.5 H14.5 V22 H9.5 V14.5 H2 V9.5 H9.5 Z" />`,
};

/**
 * A clan's crest. Pass the stored `crest` string and the clan `tag` (the
 * default crest and the letter symbol come from it), or `parts` to draw an
 * unsaved crest such as the editor's preview.
 */
@customElement("clan-crest")
export class ClanCrestBadge extends LitElement {
  @property() crest: string | null | undefined = null;
  @property() tag = "";
  @property({ attribute: false }) parts?: ClanCrest;
  @property({ type: Number }) size = 40;

  static styles = css`
    :host {
      display: inline-block;
      flex-shrink: 0;
      line-height: 0;
    }
    svg {
      width: 100%;
      height: 100%;
      overflow: visible;
    }
  `;

  willUpdate() {
    this.style.width = `${this.size}px`;
    this.style.height = `${this.size * 1.1}px`;
  }

  private renderSymbol(crest: ClanCrest) {
    const { cy, size } = SHAPES[crest.shape];
    if (crest.symbol === "letter") {
      return svg`<text x="50" y=${cy} text-anchor="middle"
        dominant-baseline="central" font-size=${size * 1.05}
        font-weight="800" font-family="system-ui, sans-serif"
        fill="currentColor">${(this.tag[0] ?? "?").toUpperCase()}</text>`;
    }
    const scale = size / 24;
    return svg`<g fill="currentColor"
      transform="translate(${50 - size / 2} ${cy - size / 2}) scale(${scale})"
      >${SYMBOLS[crest.symbol]}</g>`;
  }

  render() {
    const crest = this.parts ?? crestOf(this.crest, this.tag);
    const field = CREST_COLORS[crest.field];
    const charge = CREST_COLORS[crest.charge];
    const outline = SHAPES[crest.shape].outline;
    return html`<svg
      viewBox="-4 -4 108 118"
      role="img"
      aria-label=${this.tag}
      style="color:${charge}"
    >
      <defs>
        <linearGradient id="sheen" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stop-color="#fff" stop-opacity="0.28" />
          <stop offset="0.5" stop-color="#fff" stop-opacity="0" />
          <stop offset="1" stop-color="#000" stop-opacity="0.25" />
        </linearGradient>
      </defs>
      <g fill=${field}>${outline}</g>
      ${this.renderSymbol(crest)}
      <g fill="url(#sheen)">${outline}</g>
      <g fill="none" stroke=${charge} stroke-width="5" stroke-linejoin="round">
        ${outline}
      </g>
    </svg>`;
  }
}
