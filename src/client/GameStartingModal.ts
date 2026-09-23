import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { translateText } from "./Utils";

@customElement("game-starting-modal")
export class GameStartingModal extends LitElement {
  @state()
  isVisible = false;

  createRenderRoot() {
    return this;
  }

  render() {
    const isVisible = this.isVisible;
    return html`
      <div
        class="fixed inset-0 bg-black/30 backdrop-blur-[4px] z-[9998] transition-all duration-300 ${isVisible
          ? "opacity-100 visible"
          : "opacity-0 invisible"}"
      ></div>
      <div
        class="fixed top-1/2 left-1/2 bg-zinc-900/90 backdrop-blur-md border border-white/10 p-6 rounded-2xl z-[9999] shadow-2xl text-white w-[400px] text-center transition-all duration-300 -translate-x-1/2 ${isVisible
          ? "opacity-100 visible -translate-y-1/2"
          : "opacity-0 invisible -translate-y-[48%]"}"
      >
        <p
          class="text-xl font-medium tracking-wider text-white bg-white/5 border border-white/10 px-4 py-3 rounded-xl"
        >
          ${translateText("game_starting_modal.title")}
        </p>
        <!-- Kept visible (AGPL section 7(b) notice), but low-key. -->
        <div class="mt-4 text-[11px] leading-relaxed text-white/35">
          <div>${translateText("main.copyright")}</div>
          <div>
            ${translateText("game_starting_modal.code_license")} ·
            <a
              href="https://github.com/BroussenDev/Territorium/blob/main/CREDITS.md"
              target="_blank"
              rel="noopener noreferrer"
              class="underline decoration-white/20 transition-colors hover:text-white/70"
              >${translateText("game_starting_modal.credits")}</a
            >
          </div>
        </div>
      </div>
    `;
  }

  show() {
    this.isVisible = true;
    this.requestUpdate();
  }

  hide() {
    this.isVisible = false;
    this.requestUpdate();
  }
}
