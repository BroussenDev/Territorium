import { html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { assetUrl } from "../../core/AssetUrls";
import {
  AudioCategory,
  getDefaultKeybinds,
  UserSettings,
} from "../../core/game/UserSettings";
import {
  keybindConflicts,
  readUserKeybinds,
  UserKeybinds,
} from "../KeybindRules";
import { Platform } from "../Platform";
import { audioControls } from "../sound/CuePlayer";
import { formatKeyForDisplay, translateText } from "../Utils";
import "./baseComponents/setting/SettingKeybind";
import "./baseComponents/setting/SettingSlider";

export interface FirstLaunchLanguageEntry {
  code: string;
  native: string;
  en: string;
  svg: string;
}

type Step = "language" | "audio" | "keys";

/** Where the master volume starts on a first launch. */
export const FIRST_LAUNCH_MASTER_VOLUME = 0.5;

/** The channels the sound step offers; the rest live in Settings > Audio. */
const AUDIO_CHANNELS: readonly AudioCategory[] = [
  "master",
  "music",
  "effects",
  "alerts",
];

/**
 * The keys a new player needs first; every other one lives in
 * Settings > Keybinds.
 */
export const FIRST_LAUNCH_KEYS: readonly { action: string; label: string }[] = [
  { action: "moveUp", label: "user_setting.move_up" },
  { action: "moveLeft", label: "user_setting.move_left" },
  { action: "moveDown", label: "user_setting.move_down" },
  { action: "moveRight", label: "user_setting.move_right" },
  { action: "zoomIn", label: "user_setting.zoom_in" },
  { action: "zoomOut", label: "user_setting.zoom_out" },
  { action: "centerCamera", label: "user_setting.center_camera" },
  { action: "attackRatioDown", label: "user_setting.attack_ratio_down" },
  { action: "attackRatioUp", label: "user_setting.attack_ratio_up" },
  { action: "boatAttack", label: "user_setting.boat_attack" },
  { action: "toggleView", label: "user_setting.toggle_view" },
  { action: "pauseGame", label: "user_setting.pause_game" },
];

// Longest the Test button stays disabled waiting for its cue.
const PREVIEW_CEILING_MS = 10_000;

/**
 * The Steam app's first screens after the studio splash: the language
 * (already set to the one Steam or the system reports, so most players only
 * press Continue), then the sound, then the main keys, then the game.
 *
 * Picking a language switches the game to it at once (these screens
 * included, through LangSelector). Shown once: LangSelector opens it only
 * while no language has been saved, and the language is saved on the first
 * Continue. Keys are skipped on a touch device, which has none.
 */
@customElement("first-launch-language")
export class FirstLaunchLanguage extends LitElement {
  @property({ attribute: false }) languages: FirstLaunchLanguageEntry[] = [];
  // The language the player most likely reads (their Steam language, else
  // their system's), offered first; null when that is English.
  @property({ attribute: false }) suggested: string | null = null;
  @state() private selected = "en";
  @state() private step: Step = "language";
  @state() private keybinds: UserKeybinds = {};
  @state() private conflict: string | null = null;
  @state() private previewing = false;

  private readonly userSettings = new UserSettings();
  private readonly defaultKeybinds = getDefaultKeybinds(Platform.isMac);

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    // The game already runs in the suggested language: keep it selected.
    if (this.suggested !== null) this.selected = this.suggested;
    this.userSettings.setAudioVolume("master", FIRST_LAUNCH_MASTER_VOLUME);
    this.keybinds = readUserKeybinds(this.userSettings);
    document.addEventListener("keydown", this.onKeyDown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("keydown", this.onKeyDown);
  }

  private steps(): Step[] {
    return Platform.isTouch
      ? ["language", "audio"]
      : ["language", "audio", "keys"];
  }

  private onKeyDown = (e: KeyboardEvent) => {
    // On the keys step Enter may be the key being bound.
    if (e.key === "Enter" && this.step !== "keys") this.next();
  };

  private pick(code: string) {
    this.selected = code;
    window.dispatchEvent(
      new CustomEvent("language-selected", { detail: { lang: code } }),
    );
  }

  private next() {
    if (this.step === "language") {
      // Saves the choice even when it is the language the game started in.
      window.dispatchEvent(
        new CustomEvent("language-selected", {
          detail: { lang: this.selected },
        }),
      );
    }
    const steps = this.steps();
    const at = steps.indexOf(this.step);
    if (at === steps.length - 1) {
      this.dispatchEvent(new CustomEvent("close"));
      return;
    }
    this.conflict = null;
    this.step = steps[at + 1];
  }

  private back() {
    const steps = this.steps();
    const at = steps.indexOf(this.step);
    if (at > 0) {
      this.conflict = null;
      this.step = steps[at - 1];
    }
  }

  private ordered(): FirstLaunchLanguageEntry[] {
    const first = [this.suggested, "en"].filter(
      (code, i, all): code is string =>
        code !== null && all.indexOf(code) === i,
    );
    const head = first
      .map((code) => this.languages.find((l) => l.code === code))
      .filter((l): l is FirstLaunchLanguageEntry => l !== undefined);
    const rest = this.languages
      .filter((l) => !first.includes(l.code))
      .sort((a, b) => a.en.localeCompare(b.en));
    return [...head, ...rest];
  }

  private setVolume(
    category: AudioCategory,
    e: CustomEvent<{ value: number }>,
  ) {
    this.userSettings.setAudioVolume(category, e.detail.value / 100);
    this.requestUpdate();
  }

  private async testSound() {
    const controls = audioControls();
    if (controls === null || this.previewing) return;
    this.previewing = true;
    let ceiling: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        controls.previewCue("effects"),
        new Promise<void>((resolve) => {
          ceiling = setTimeout(resolve, PREVIEW_CEILING_MS);
        }),
      ]);
    } catch (error) {
      console.warn("Failed to play audio preview", error);
    } finally {
      if (ceiling !== undefined) clearTimeout(ceiling);
      this.previewing = false;
    }
  }

  private changeKey(
    e: CustomEvent<{
      action: string;
      value: string;
      key: string;
      prevValue?: string;
    }>,
  ) {
    const { action, value, key, prevValue } = e.detail;
    if (keybindConflicts(this.defaultKeybinds, this.keybinds, action, value)) {
      this.conflict = formatKeyForDisplay(key || value);
      const element = this.querySelector<HTMLElement & { value: string }>(
        `setting-keybind[action="${action}"]`,
      );
      if (element) element.value = prevValue ?? this.defaultKeybinds[action];
      return;
    }
    this.conflict = null;
    this.keybinds = { ...this.keybinds, [action]: { value, key } };
    this.userSettings.setKeybinds(this.keybinds);
  }

  private keyValue(action: string): string | undefined {
    const entry = this.keybinds[action];
    if (!entry) return undefined;
    return entry.value === "Null" ? "" : entry.value || undefined;
  }

  private keyDisplay(action: string): string {
    const entry = this.keybinds[action];
    if (!entry) return formatKeyForDisplay(this.defaultKeybinds[action] ?? "");
    return entry.key || formatKeyForDisplay(entry.value || "");
  }

  private renderProgress() {
    const steps = this.steps();
    const at = steps.indexOf(this.step);
    return html`
      <ol
        class="flex items-center gap-2"
        aria-label="${at + 1}/${steps.length}"
      >
        ${steps.map(
          (step, i) => html`
            <li class="flex items-center gap-2">
              ${i > 0
                ? html`<span
                    class="h-px w-8 ${i <= at
                      ? "bg-emerald-400/70"
                      : "bg-white/15"}"
                  ></span>`
                : null}
              <span
                class="flex items-center gap-2 text-sm font-semibold ${i === at
                  ? "text-white"
                  : i < at
                    ? "text-emerald-300/80"
                    : "text-white/35"}"
                aria-current=${i === at ? "step" : "false"}
              >
                <span
                  class="flex size-6 items-center justify-center rounded-full border text-xs ${i ===
                  at
                    ? "border-emerald-400 bg-emerald-500/20"
                    : i < at
                      ? "border-emerald-400/50"
                      : "border-white/20"}"
                  >${i + 1}</span
                >
                ${translateText(`first_launch.step_${step}`)}
              </span>
            </li>
          `,
        )}
      </ol>
    `;
  }

  private renderLanguage() {
    return html`
      <div class="text-center">
        <h1
          id="first-launch-title"
          class="font-display text-3xl font-bold text-balance"
        >
          ${translateText("first_launch.title")}
        </h1>
        <p class="mt-2 text-sm text-white/60 text-balance">
          ${translateText("first_launch.subtitle")}
        </p>
      </div>

      <ul
        class="grid max-h-[50vh] w-full grid-cols-2 gap-2 overflow-y-auto p-1 sm:grid-cols-3 lg:grid-cols-5"
      >
        ${this.ordered().map((lang) => {
          const selected = lang.code === this.selected;
          return html`<li>
            <button
              type="button"
              data-lang=${lang.code}
              aria-pressed=${selected}
              @click=${() => this.pick(lang.code)}
              class="flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-emerald-400 ${selected
                ? "border-emerald-400/70 bg-emerald-500/15"
                : "border-white/10 bg-black/30 hover:border-white/25 hover:bg-white/[0.04]"}"
            >
              <img
                src=${assetUrl(`flags/${lang.svg}.svg`)}
                alt=""
                class="h-6 w-8 shrink-0 rounded-sm object-cover"
                draggable="false"
              />
              <span class="flex min-w-0 flex-col">
                <span class="truncate font-display font-semibold"
                  >${lang.native}</span
                >
                <span class="truncate text-xs text-white/50"
                  >${lang.code === this.suggested
                    ? translateText("first_launch.suggested")
                    : lang.en}</span
                >
              </span>
            </button>
          </li>`;
        })}
      </ul>
    `;
  }

  private renderAudio() {
    const controls = audioControls();
    const audible = controls?.isAudible("effects") ?? false;
    return html`
      <div class="text-center">
        <h1
          id="first-launch-title"
          class="font-display text-3xl font-bold text-balance"
        >
          ${translateText("first_launch.audio_title")}
        </h1>
        <p class="mt-2 text-sm text-white/60 text-balance">
          ${translateText("first_launch.audio_subtitle")}
        </p>
      </div>

      <div class="flex w-full max-w-2xl flex-col gap-2" data-first-launch-audio>
        ${AUDIO_CHANNELS.map(
          (category) => html`
            <setting-slider
              label=${translateText(`user_setting.audio_${category}`)}
              description=${translateText(
                `user_setting.audio_${category}_desc`,
              )}
              id="first-launch-${category}"
              min="0"
              max="100"
              unit=""
              .value=${Math.round(
                this.userSettings.audioVolume(category) * 100,
              )}
              @change=${(e: CustomEvent<{ value: number }>) =>
                this.setVolume(category, e)}
            ></setting-slider>
          `,
        )}
        ${controls !== null
          ? html`<div class="flex justify-end">
              <button
                type="button"
                data-first-launch-test
                class="rounded-md border border-white/15 px-4 py-2 text-sm font-semibold text-white transition-colors ${audible &&
                !this.previewing
                  ? "bg-white/5 hover:bg-white/15"
                  : "cursor-not-allowed opacity-40"}"
                ?disabled=${!audible || this.previewing}
                @click=${() => this.testSound()}
              >
                ${translateText("first_launch.audio_test")}
              </button>
            </div>`
          : null}
      </div>
    `;
  }

  private renderKeys() {
    return html`
      <div class="text-center">
        <h1
          id="first-launch-title"
          class="font-display text-3xl font-bold text-balance"
        >
          ${translateText("first_launch.keys_title")}
        </h1>
        <p class="mt-2 text-sm text-white/60 text-balance">
          ${translateText("first_launch.keys_subtitle")}
        </p>
      </div>

      <div
        class="grid max-h-[50vh] w-full grid-cols-1 gap-2 overflow-y-auto p-1 lg:grid-cols-2"
        data-first-launch-keys
      >
        ${FIRST_LAUNCH_KEYS.map(
          ({ action, label }) => html`
            <setting-keybind
              action=${action}
              label=${translateText(label, { amount: 10 })}
              .defaultKey=${this.defaultKeybinds[action]}
              .value=${this.keyValue(action)}
              .display=${this.keyDisplay(action)}
              @change=${this.changeKey}
            ></setting-keybind>
          `,
        )}
      </div>
      ${this.conflict !== null
        ? html`<p class="text-sm font-medium text-red-300" role="alert">
            ${translateText("user_setting.keybind_conflict_error", {
              key: this.conflict,
            })}
          </p>`
        : null}
    `;
  }

  render() {
    const steps = this.steps();
    const last = steps.indexOf(this.step) === steps.length - 1;
    const body =
      this.step === "language"
        ? this.renderLanguage()
        : this.step === "audio"
          ? this.renderAudio()
          : this.renderKeys();
    return html`
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-launch-title"
        class="fixed inset-0 z-[10030] flex items-center justify-center overflow-hidden bg-[#050b09] p-4 text-white"
      >
        <div
          class="territory-mesh absolute inset-0 bg-emerald-500/[0.05] [mask-image:radial-gradient(ellipse_at_50%_20%,#000,transparent_70%)]"
          aria-hidden="true"
        ></div>
        <div
          class="absolute inset-x-0 top-0 h-[45vh] bg-[radial-gradient(ellipse_at_50%_0%,rgb(16_185_129/0.18),transparent_70%)]"
          aria-hidden="true"
        ></div>

        <div class="relative flex w-full max-w-5xl flex-col items-center gap-6">
          <img
            src=${assetUrl("images/TerritoriumLogo.svg")}
            alt="Territorium"
            class="h-10 w-auto"
            draggable="false"
          />
          ${this.renderProgress()} ${body}

          <div class="flex items-center gap-3">
            ${this.step !== "language"
              ? html`<button
                  type="button"
                  data-first-launch-back
                  @click=${() => this.back()}
                  class="rounded-md border border-white/15 bg-white/[0.04] px-6 py-3 font-display text-base font-semibold text-white/80 transition-colors hover:border-white/30 hover:text-white"
                >
                  ${translateText("first_launch.back")}
                </button>`
              : null}
            <button
              type="button"
              data-first-launch-continue
              @click=${() => this.next()}
              class="min-w-56 rounded-md bg-capital px-10 py-3 font-display text-base font-bold text-capital-ink transition-colors hover:bg-capital-light"
            >
              ${translateText(
                last ? "first_launch.play" : "first_launch.continue",
              )}
            </button>
          </div>
        </div>
      </div>
    `;
  }
}
