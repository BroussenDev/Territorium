import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import {
  desktopQuit,
  isDesktopShell,
  requestDesktopQuit,
} from "../DesktopShell";
import { translateText } from "../Utils";

export type WebGLGateStatus = "software" | "unsupported" | "limited";

// Hard-block troubleshooting screen seen by a small fraction of sessions (no
// GPU-accelerated WebGL2). Each browser gets one short line in the player's
// language; the browser names and about:config keys stay as they are.
const BROWSER_STEPS: ReadonlyArray<{ title: string; key: string }> = [
  { title: "Google Chrome", key: "webgl_gate.step_chrome" },
  { title: "Microsoft Edge", key: "webgl_gate.step_edge" },
  { title: "Mozilla Firefox", key: "webgl_gate.step_firefox" },
  { title: "Safari", key: "webgl_gate.step_safari" },
];

// Shown for the "limited" status: WebGL works but texture sizes are capped
// below what the game needs, so the map may render with black areas (#4357).
// The only known cause is fingerprinting protection
// (privacy.resistFingerprinting — on by default in LibreWolf and Mullvad
// Browser, opt-in in Firefox). Unlike the other statuses this is a warning:
// the player may dismiss it and play anyway.
const LIMITED_BROWSERS = "Firefox / LibreWolf / Mullvad Browser";

// The desktop shell bundles its own Chromium, so browser settings, flags and
// the player's default browser have no bearing on it. Restarting is what
// players report clears it. Unlike the browser steps above, these name no
// browser UI, so they are translated.
const DESKTOP_STEP_KEYS = [
  "desktop_webgl_gate.step_quit",
  "desktop_webgl_gate.step_restart_steam",
  "desktop_webgl_gate.step_restart_computer",
  "desktop_webgl_gate.step_drivers",
];

/**
 * Full-screen gate shown when the WebGL2 context is unusable ("software",
 * "unsupported" — hard block) or degraded ("limited" — texture sizes capped
 * by fingerprinting protection; dismissible via "Continue anyway"). Shows how
 * to turn hardware acceleration / WebGL back on, or exempt the site from
 * fingerprinting protection, across the most popular browsers. Shown
 * imperatively from the game-start path.
 */
@customElement("webgl-gate")
export class WebGLGate extends LitElement {
  @property() status: WebGLGateStatus = "software";

  // Render into light DOM so global styles (Tailwind utilities, bg-surface) apply.
  createRenderRoot() {
    return this;
  }

  render() {
    if (this.status !== "limited" && isDesktopShell()) {
      return this.renderDesktop();
    }
    const limited = this.status === "limited";
    const sections = limited
      ? [
          {
            title: LIMITED_BROWSERS,
            text: translateText("webgl_gate.step_limited", {
              host: window.location.hostname,
            }),
          },
        ]
      : BROWSER_STEPS.map(({ title, key }) => ({
          title,
          text: translateText(key),
        }));

    return html`
      <div
        class="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-5 backdrop-blur-[2px]"
      >
        <div
          class="relative w-full max-w-lg max-h-[85vh] overflow-y-auto p-6 sm:p-8 rounded-lg border border-white/10 border-t-[3px] border-t-capital bg-[linear-gradient(180deg,#11221c_0%,#0a1512_100%)] text-white shadow-[0_24px_60px_-20px_rgb(0_0_0/0.85)]"
        >
          <h2 class="font-display text-xl font-bold mb-3">
            ${translateText(`webgl_gate.title_${this.status}`)}
          </h2>
          <p class="text-sm leading-relaxed text-white/85 mb-5">
            ${translateText(`webgl_gate.intro_${this.status}`)}
          </p>
          <div class="flex flex-col gap-2.5">
            ${sections.map(
              (section) => html`
                <section
                  class="rounded-md border border-white/10 bg-black/25 px-4 py-3"
                >
                  <h3
                    class="font-display text-sm font-semibold text-capital-light mb-1"
                  >
                    ${section.title}
                  </h3>
                  <p class="text-sm leading-relaxed text-white/85">
                    ${section.text}
                  </p>
                </section>
              `,
            )}
          </div>
          <p class="mt-4 text-sm leading-relaxed text-white/60">
            ${translateText(
              limited ? "webgl_gate.note_limited" : "webgl_gate.note_drivers",
            )}
          </p>
          ${limited
            ? html`
                <button
                  class="mt-5 w-full py-2.5 rounded-md border border-white/15 bg-white/[0.04] hover:border-white/30 font-display text-sm font-semibold text-white transition-colors"
                  @click=${() => this.remove()}
                >
                  ${translateText("webgl_gate.continue")}
                </button>
              `
            : null}
        </div>
      </div>
    `;
  }

  private renderDesktop() {
    return html`
      <div
        class="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-5 backdrop-blur-[2px]"
      >
        <div
          class="relative w-full max-w-lg max-h-[85vh] overflow-y-auto p-6 sm:p-8 rounded-lg border border-white/10 border-t-[3px] border-t-capital bg-[linear-gradient(180deg,#11221c_0%,#0a1512_100%)] text-white shadow-[0_24px_60px_-20px_rgb(0_0_0/0.85)]"
        >
          <h2 class="font-display text-xl font-bold mb-3">
            ${translateText("desktop_webgl_gate.title")}
          </h2>
          <p class="text-sm leading-relaxed text-white/85 mb-5">
            ${translateText("desktop_webgl_gate.intro")}
          </p>
          <ol
            class="pl-5 list-decimal text-sm leading-relaxed text-white/85 space-y-1.5"
          >
            ${DESKTOP_STEP_KEYS.map(
              (key) => html`<li>${translateText(key)}</li>`,
            )}
          </ol>
          ${desktopQuit() !== null
            ? html`
                <button
                  class="mt-5 w-full py-2.5 rounded-md border border-white/15 bg-white/[0.04] hover:border-white/30 font-display text-sm font-semibold text-white transition-colors"
                  @click=${() => requestDesktopQuit()}
                >
                  ${translateText("desktop_webgl_gate.quit")}
                </button>
              `
            : null}
        </div>
      </div>
    `;
  }
}
