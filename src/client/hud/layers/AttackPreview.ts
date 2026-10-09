import { html, LitElement, svg } from "lit";
import { customElement, state } from "lit/decorators.js";
import { TerrainType } from "../../../core/game/Game";
import { renderNumber, renderTroops, translateText } from "../../Utils";

export interface AttackPreviewData {
  tiles: number;
  seconds: number;
  lost: number;
  sent: number;
  vsPlayer: boolean;
  wipesOut: boolean;
  defensePost: boolean;
  terrain: TerrainType;
}

/**
 * The attack preview's label by the cursor (AttackPreviewController paints
 * the zone on the map): tiles taken and duration, and against a player what
 * the attack costs, with small marks for hills, mountains and a defense
 * post. It follows the mouse through a CSS transform, without re-rendering.
 */
@customElement("attack-preview")
export class AttackPreview extends LitElement {
  @state() private data: AttackPreviewData | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.style.position = "fixed";
    this.style.left = "0";
    this.style.top = "0";
    this.style.zIndex = "900";
    this.style.pointerEvents = "none";
    this.style.willChange = "transform";
  }

  moveTo(x: number, y: number) {
    const left = Math.min(x + 20, window.innerWidth - 190);
    const top = Math.min(y + 20, window.innerHeight - 80);
    this.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  }

  show(data: AttackPreviewData) {
    const d = this.data;
    // Re-render only when what is shown changes.
    if (
      d !== null &&
      d.tiles === data.tiles &&
      Math.round(d.seconds) === Math.round(data.seconds) &&
      renderTroops(d.lost) === renderTroops(data.lost) &&
      d.wipesOut === data.wipesOut &&
      d.defensePost === data.defensePost &&
      d.terrain === data.terrain
    ) {
      return;
    }
    this.data = data;
  }

  hide() {
    this.data = null;
  }

  private time(seconds: number): string {
    const s = Math.max(1, Math.round(seconds));
    return s < 60
      ? translateText("attack_preview.seconds", { s })
      : translateText("attack_preview.minutes", {
          m: Math.floor(s / 60),
          s: String(s % 60).padStart(2, "0"),
        });
  }

  render() {
    const d = this.data;
    if (d === null) return html``;
    const spent = d.vsPlayer && !d.wipesOut && d.lost >= d.sent * 0.95;
    const accent = spent ? "#f87171" : "#34d399";
    const relief =
      d.terrain === TerrainType.Mountain
        ? translateText("attack_preview.terrain_mountain")
        : d.terrain === TerrainType.Highland
          ? translateText("attack_preview.terrain_highland")
          : null;
    return html`
      <div
        data-attack-preview
        class="flex flex-col gap-0.5 rounded-md border border-white/10 bg-[#0a1512]/90 px-2.5 py-1.5 text-white shadow-[0_10px_24px_-12px_rgb(0_0_0/0.9)] backdrop-blur-xs"
        style="border-left: 3px solid ${accent}"
      >
        <div class="flex items-center gap-2 tabular-nums">
          <svg
            viewBox="0 0 24 24"
            class="size-3.5 shrink-0"
            fill="none"
            stroke=${accent}
            stroke-width="2.2"
            stroke-linecap="round"
            aria-hidden="true"
          >
            ${svg`<path d="M5 19 19 5M14 5h5v5"></path>`}
          </svg>
          <span class="font-display text-sm font-bold"
            >${d.wipesOut
              ? translateText("attack_preview.all_tiles")
              : renderNumber(d.tiles)}</span
          >
          <span class="text-[11px] text-white/55"
            >${translateText("attack_preview.tiles_unit")}</span
          >
          <span class="h-3 w-px bg-white/15" aria-hidden="true"></span>
          <span class="text-xs text-white/80">${this.time(d.seconds)}</span>
          ${relief !== null
            ? html`<svg
                viewBox="0 0 24 24"
                class="size-3.5 shrink-0 text-white/60"
                fill="currentColor"
                role="img"
                aria-label=${relief}
              >
                ${svg`<title>${relief}</title><path d="M2 20 9 7l4 7 2-3 7 9Z"></path>`}
              </svg>`
            : null}
          ${d.defensePost
            ? html`<svg
                viewBox="0 0 24 24"
                class="size-3.5 shrink-0 text-red-300"
                fill="currentColor"
                role="img"
                aria-label=${translateText("attack_preview.defense_post")}
              >
                ${svg`<title>${translateText("attack_preview.defense_post")}</title><path d="M12 2 20 5v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5Z"></path>`}
              </svg>`
            : null}
        </div>
        ${d.vsPlayer
          ? html`<div
              class="text-[11px] tabular-nums"
              style="color: ${spent ? "#fca5a5" : "rgb(255 255 255 / 0.6)"}"
            >
              ${spent
                ? translateText("attack_preview.runs_out")
                : translateText("attack_preview.costs", {
                    troops: renderTroops(d.lost),
                  })}
            </div>`
          : null}
      </div>
    `;
  }
}
