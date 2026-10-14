import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import {
  type GraphicsQuality,
  UserSettings,
} from "../../core/game/UserSettings";
import { type QualityAdvice, QualityWatch } from "../QualityWatch";
import { windowState } from "../render/gl/FrameCap";
import { translateText } from "../Utils";

/**
 * The in-game offer of a lower graphics quality when the game runs slowly
 * (QualityWatch.ts). A small card at the top of the screen that leaves the
 * game playable underneath; switching takes effect at once, without leaving
 * the game.
 */
@customElement("quality-suggestion")
export class QualitySuggestion extends LitElement {
  @property({ attribute: false }) quality: GraphicsQuality = "normal";
  @property({ type: Number }) fps = 0;

  createRenderRoot() {
    return this;
  }

  private answer(name: "accept" | "keep" | "later") {
    this.dispatchEvent(new CustomEvent(name));
  }

  render() {
    const quality = translateText(
      `user_setting.graphics_quality_${this.quality}`,
    );
    return html`
      <div
        role="status"
        class="fixed left-1/2 top-3 z-[60] flex w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-2 rounded-lg border border-white/15 bg-[#07130f]/95 p-4 text-white shadow-2xl backdrop-blur-sm"
        data-quality-suggestion
      >
        <div class="flex items-start gap-3">
          <svg
            viewBox="0 0 24 24"
            class="mt-0.5 size-5 shrink-0 text-amber-300"
            aria-hidden="true"
          >
            <path
              d="M4 18a8 8 0 1 1 16 0"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
            <path
              d="M12 18 8 11"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <p class="font-display font-bold">
              ${translateText("graphics_check.slow_title")}
            </p>
            <p class="text-sm leading-snug text-white/70">
              ${translateText("graphics_check.slow_body", {
                fps: this.fps,
                quality,
              })}
            </p>
          </div>
          <button
            type="button"
            class="-mr-1 -mt-1 rounded p-1 text-white/50 hover:text-white"
            aria-label=${translateText("graphics_check.later")}
            @click=${() => this.answer("later")}
          >
            <svg viewBox="0 0 16 16" class="size-4" aria-hidden="true">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </div>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            data-quality-keep
            class="rounded-md border border-white/15 px-3 py-1.5 text-sm font-semibold text-white/80 hover:border-white/30 hover:text-white"
            @click=${() => this.answer("keep")}
          >
            ${translateText("graphics_check.keep")}
          </button>
          <button
            type="button"
            data-quality-accept
            class="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-bold text-emerald-950 hover:bg-emerald-400"
            @click=${() => this.answer("accept")}
          >
            ${translateText("graphics_check.switch", { quality })}
          </button>
        </div>
      </div>
    `;
  }
}

/**
 * Runs the watch for one game and shows the offer when it has one.
 * "Switch" applies the level and keeps watching (one more step down may
 * still be needed), "Keep" never asks again, the close button only for this
 * game.
 */
export class QualitySuggestionController {
  private readonly watch = new QualityWatch();
  private element: QualitySuggestion | null = null;
  private quietThisGame = false;

  constructor(private readonly settings: UserSettings = new UserSettings()) {}

  recordFrame(now: number): void {
    if (this.quietThisGame || this.element !== null) return;
    if (this.settings.qualitySuggestionDone()) return;
    const cap = this.settings.frameRateCap();
    const counts = windowState() === "active" && (cap === 0 || cap >= 60);
    const advice = this.watch.recordFrame(
      now,
      counts,
      this.settings.graphicsQuality(),
    );
    if (advice !== null) this.show(advice);
  }

  private show(advice: QualityAdvice): void {
    const element = document.createElement(
      "quality-suggestion",
    ) as QualitySuggestion;
    element.quality = advice.quality;
    element.fps = advice.fps;
    const close = () => {
      element.remove();
      this.element = null;
      this.watch.reset();
    };
    element.addEventListener("accept", () => {
      this.settings.setGraphicsQuality(advice.quality);
      close();
    });
    element.addEventListener("keep", () => {
      this.settings.markQualitySuggestionDone();
      close();
    });
    element.addEventListener("later", () => {
      this.quietThisGame = true;
      close();
    });
    this.element = element;
    document.body.appendChild(element);
  }

  dispose(): void {
    this.element?.remove();
    this.element = null;
  }
}
