import { html, LitElement, render as litRender } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { ColumnId } from "../../StatsConstants";
import { translateText } from "../../Utils";
import type { ColumnDef } from "./lib/StatsColumns";

/**
 * Column-settings button + checkbox popover for choosing which stat columns a panel
 * shows. Emits `columns-changed` (CustomEvent<ColumnId[]>) with the new
 * selection in registry order; the host persists and re-renders.
 */
@customElement("column-picker")
export class ColumnPicker extends LitElement {
  @property({ attribute: false }) columns: readonly ColumnDef[] = [];
  @property({ attribute: false }) selected: readonly ColumnId[] = [];

  @state() private open = false;
  private portal: HTMLDivElement | null = null;

  createRenderRoot() {
    return this; // light DOM for Tailwind
  }

  private onDocumentClick = (e: MouseEvent) => {
    const target = e.target as Node;
    if (this.open && !this.contains(target) && !this.portal?.contains(target)) {
      this.open = false;
    }
  };

  private onViewportChange = (event: Event) => {
    const target = event.target;
    if (
      this.open &&
      !(target instanceof Node && this.portal?.contains(target))
    ) {
      this.renderPortal();
    }
  };

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("click", this.onDocumentClick);
    window.addEventListener("resize", this.onViewportChange);
    window.addEventListener("scroll", this.onViewportChange, true);
  }

  disconnectedCallback() {
    document.removeEventListener("click", this.onDocumentClick);
    window.removeEventListener("resize", this.onViewportChange);
    window.removeEventListener("scroll", this.onViewportChange, true);
    this.removePortal();
    super.disconnectedCallback();
  }

  protected updated() {
    this.renderPortal();
  }

  private toggle(id: ColumnId) {
    const isSelected = this.selected.includes(id);
    if (isSelected && this.selected.length === 1) return; // keep at least one
    const next = this.columns
      .map((c) => c.id)
      .filter((cid) =>
        cid === id ? !isSelected : this.selected.includes(cid),
      );
    this.dispatchEvent(
      new CustomEvent<ColumnId[]>("columns-changed", {
        detail: next,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private renderPortal() {
    if (!this.open || !this.isConnected) {
      this.removePortal();
      return;
    }

    const trigger = this.querySelector("button");
    if (trigger === null) return;

    if (this.portal === null) {
      this.portal = document.createElement("div");
      this.portal.className = "column-picker-portal";
      document.body.appendChild(this.portal);
    }

    const rect = trigger.getBoundingClientRect();
    const right = Math.max(8, window.innerWidth - rect.right);
    const top = rect.bottom + 4;
    const maxHeight = Math.max(
      80,
      Math.min(window.innerHeight * 0.4, window.innerHeight - top - 8),
    );

    litRender(
      html`
        <div
          class="column-picker-popover fixed z-2000 min-w-40 bg-gray-900/95 backdrop-blur-sm border border-white/10 rounded-lg shadow-xl shadow-black/40 p-1.5 flex flex-col gap-0.5 overflow-y-auto whitespace-nowrap"
          style="top: ${top}px; right: ${right}px; max-height: ${maxHeight}px;"
        >
          <div
            class="px-2 pt-1 pb-1.5 mb-0.5 border-b border-white/10 text-[10px] lg:text-xs font-bold uppercase tracking-wider text-white/50"
          >
            ${translateText("leaderboard.configure_columns")}
          </div>
          ${this.columns.map((column) => {
            const checked = this.selected.includes(column.id);
            return html`
              <label
                class="flex items-center gap-2 px-2 py-1 rounded-md text-xs lg:text-sm cursor-pointer transition-colors hover:bg-white/10 ${checked
                  ? "text-white"
                  : "text-white/60"}"
              >
                <input
                  type="checkbox"
                  class="w-3.5 h-3.5 accent-emerald-500 cursor-pointer"
                  .checked=${checked}
                  ?disabled=${checked && this.selected.length === 1}
                  @change=${() => this.toggle(column.id)}
                />
                ${translateText(column.labelKey)}
              </label>
            `;
          })}
        </div>
      `,
      this.portal,
    );
  }

  private removePortal() {
    this.portal?.remove();
    this.portal = null;
  }

  render() {
    return html`
      <button
        class="flex items-center justify-center w-5 h-5 lg:w-6 lg:h-6 rounded-md border transition-colors focus-visible:outline-2 focus-visible:outline-emerald-400 ${this
          .open
          ? "bg-emerald-500/20 border-emerald-400/60 text-emerald-300"
          : "bg-white/5 border-white/15 text-white/70 hover:bg-white/15 hover:text-white"}"
        title=${translateText("leaderboard.configure_columns")}
        aria-label=${translateText("leaderboard.configure_columns")}
        aria-expanded=${this.open}
        aria-haspopup="menu"
        @click=${() => (this.open = !this.open)}
      >
        <!-- Sliders: the columns shown are a setting, not a gear-heavy menu. -->
        <svg
          viewBox="0 0 16 16"
          class="w-3 h-3 lg:w-3.5 lg:h-3.5"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M2 4h12M2 8h12M2 12h12" stroke-opacity=".45" />
          <circle cx="5" cy="4" r="1.7" fill="currentColor" />
          <circle cx="11" cy="8" r="1.7" fill="currentColor" />
          <circle cx="7" cy="12" r="1.7" fill="currentColor" />
        </svg>
      </button>
    `;
  }
}
