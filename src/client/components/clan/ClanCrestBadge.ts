import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import { type ClanCrest, crestOf } from "../../../core/ClanCrest";
import { CREST_VIEW_BOX, crestMarkup } from "./CrestArt";

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

  render() {
    const crest = this.parts ?? crestOf(this.crest, this.tag);
    const { x, y, w, h } = CREST_VIEW_BOX;
    return html`<svg
      viewBox="${x} ${y} ${w} ${h}"
      role="img"
      aria-label=${this.tag}
    >
      ${unsafeSVG(crestMarkup(crest, this.tag))}
    </svg>`;
  }
}
