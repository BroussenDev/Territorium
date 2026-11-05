import { html, LitElement, TemplateResult } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { crazyGamesSDK } from "src/client/CrazyGamesSDK";
import { PauseGameIntentEvent } from "src/client/Transport";
import { EventBus } from "../../../core/EventBus";
import { openBugReport } from "../../BugReport";
import { Controller } from "../../Controller";
import {
  AlternateViewEvent,
  ToggleRenderDebugGuiEvent,
} from "../../InputHandler";
import { openIdeas, openLinks, renderLinkIcon } from "../../Links";
import { navigateTo } from "../../PageTransition";
import type { UserSettingModal } from "../../UserSettingModal";
import { homeHref, translateText } from "../../Utils";
import { forgetActiveGame } from "../../components/ResumeGameButton";
import {
  menuBugIcon,
  menuChevronIcon,
  menuCloseIcon,
  menuCodeIcon,
  menuExitIcon,
  menuHexIcon,
  menuSlidersIcon,
  menuTerrainIcon,
} from "./MenuIcons";

/** How long the menu stays on screen to play its closing animation. */
const CLOSE_ANIMATION_MS = 170;
const FOCUSABLE = "button:not([disabled])";

export class ShowSettingsModalEvent {
  constructor(
    public readonly isVisible: boolean = true,
    public readonly shouldPause: boolean = false,
    public readonly isPaused: boolean = false,
  ) {}
}

/**
 * The in-game menu.
 *
 * It holds what is session state or a game action — the alternate (terrain)
 * view, the debug GUI, exiting — plus a link into the settings modal. Every
 * `UserSettings`-backed row it used to duplicate, the advanced graphics
 * options included, now lives in `UserSettingModal`, which this opens through
 * the non-inline `#game-settings` instance so both entry points render the
 * same UI.
 */
@customElement("settings-modal")
export class SettingsModal extends LitElement implements Controller {
  public eventBus: EventBus;

  @state()
  private isVisible: boolean = false;

  @state()
  private alternateView: boolean = false;

  /** True while the menu plays its closing animation. */
  @state()
  private closing: boolean = false;

  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private returnFocusTo: HTMLElement | null = null;

  @query(".modal-overlay")
  private modalOverlay!: HTMLElement;

  @property({ type: Boolean })
  shouldPause = false;

  @property({ type: Boolean })
  wasPausedWhenOpened = false;

  init() {
    this.eventBus.on(ShowSettingsModalEvent, (event) => {
      this.cancelCloseAnimation();
      this.isVisible = event.isVisible;
      this.shouldPause = event.shouldPause;
      this.wasPausedWhenOpened = event.isPaused;
      this.pauseGame(true);
    });
  }

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("click", this.handleOutsideClick, true);
    window.addEventListener("keydown", this.handleKeyDown);
  }

  disconnectedCallback() {
    window.removeEventListener("click", this.handleOutsideClick, true);
    window.removeEventListener("keydown", this.handleKeyDown);
    super.disconnectedCallback();
  }

  private handleOutsideClick = (event: MouseEvent) => {
    if (
      this.isVisible &&
      this.modalOverlay &&
      event.target === this.modalOverlay
    ) {
      this.closeModal();
    }
  };

  private handleKeyDown = (event: KeyboardEvent) => {
    if (!this.isVisible) return;
    if (event.key === "Escape") {
      // Claim the key so the game does not also treat it as "open the menu".
      event.preventDefault();
      this.closeModal();
    } else if (event.key === "Tab") {
      this.trapFocus(event);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      this.moveFocus(event, event.key === "ArrowDown" ? 1 : -1);
    }
  };

  /** Whether the menu is on screen (and not already on its way out). */
  public get isOpen(): boolean {
    return this.isVisible;
  }

  public openModal() {
    this.cancelCloseAnimation();
    if (!this.isVisible) {
      const active = document.activeElement;
      this.returnFocusTo = active instanceof HTMLElement ? active : null;
    }
    this.isVisible = true;
    this.requestUpdate();
  }

  public closeModal({ keepPause = false }: { keepPause?: boolean } = {}) {
    const wasVisible = this.isVisible;
    this.isVisible = false;
    // Handing over to the settings modal swaps instantly; a plain close fades.
    if (wasVisible && !keepPause) {
      this.closing = true;
      this.closeTimer = setTimeout(() => {
        this.closing = false;
        this.closeTimer = null;
      }, CLOSE_ANIMATION_MS);
    }
    this.requestUpdate();
    if (!keepPause) {
      this.pauseGame(false);
      const target = this.returnFocusTo;
      this.returnFocusTo = null;
      if (wasVisible && target?.isConnected) {
        target.focus({ preventScroll: true });
      }
    }
  }

  private cancelCloseAnimation() {
    if (this.closeTimer !== null) clearTimeout(this.closeTimer);
    this.closeTimer = null;
    this.closing = false;
  }

  private focusables(): HTMLElement[] {
    return [...this.querySelectorAll<HTMLElement>(FOCUSABLE)];
  }

  /** Keeps Tab inside the menu, which is modal. */
  private trapFocus(event: KeyboardEvent) {
    const items = this.focusables();
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !this.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !this.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  /** Up and Down walk the rows, wrapping around. */
  private moveFocus(event: KeyboardEvent, step: 1 | -1) {
    const items = this.focusables();
    if (items.length === 0) return;
    event.preventDefault();
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = at === -1 ? 0 : (at + step + items.length) % items.length;
    items[next].focus();
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has("isVisible") && this.isVisible) {
      // The first row, not the close button: Enter lands on something useful.
      queueMicrotask(() =>
        this.querySelector<HTMLElement>("[data-menu-row]")?.focus({
          preventScroll: true,
        }),
      );
    }
  }

  private pauseGame(pause: boolean) {
    // CrazyGames: report gameplay as stopped whenever the settings menu is open,
    // and resumed when it closes — unless the game was already paused when opened.
    if (pause) {
      crazyGamesSDK.gameplayStop();
    } else if (!this.wasPausedWhenOpened) {
      crazyGamesSDK.gameplayStart();
    }

    // Only pause the simulation itself when we own the pause (singleplayer or
    // lobby creator).
    if (this.shouldPause && !this.wasPausedWhenOpened) {
      this.eventBus.emit(new PauseGameIntentEvent(pause));
    }
  }

  private onTerrainButtonClick() {
    this.alternateView = !this.alternateView;
    this.eventBus.emit(new AlternateViewEvent(this.alternateView));
    this.requestUpdate();
  }

  private onOpenSettingsButtonClick() {
    // index.html hides the page's inline <user-setting id="page-settings">
    // during a match, so the HUD addresses its own non-inline instance by id.
    const gameSettings = document.getElementById(
      "game-settings",
    ) as UserSettingModal | null;
    if (gameSettings === null || typeof gameSettings.open !== "function") {
      // Leave this menu open: closing it would strand the player with neither
      // the settings modal nor a menu.
      console.warn("In-game settings modal (#game-settings) not found");
      return;
    }
    // Keep the pause. Nothing releases it until this menu itself closes, and
    // UserSettingModal knows nothing about pausing — it only calls onReturn.
    this.closeModal({ keepPause: true });
    gameSettings.open({
      tab: "gameplay",
      // Reopen directly rather than re-emitting ShowSettingsModalEvent: init()
      // runs pauseGame(true) on every event, which would emit a second
      // PauseGameIntentEvent(true).
      onReturn: () => this.openModal(),
    });
  }

  private onRenderDebugGuiButtonClick() {
    this.eventBus.emit(new ToggleRenderDebugGuiEvent());
    this.closeModal();
  }

  private onExitButtonClick() {
    // redirect to the home page
    forgetActiveGame();
    navigateTo(homeHref());
  }

  private static readonly ROW =
    "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start text-white transition-colors " +
    "hover:bg-white/6 focus-visible:bg-white/6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-bright/80 " +
    "active:bg-white/10";

  private renderRow(opts: {
    icon: TemplateResult;
    title: string;
    desc: string;
    onClick: () => void;
    attr?: "settings" | "bug";
    trailing?: TemplateResult | null;
    switchState?: boolean;
  }) {
    const isSwitch = opts.switchState !== undefined;
    return html`<button
      type="button"
      data-menu-row
      data-open-settings=${ifDefined(opts.attr === "settings" ? "" : undefined)}
      data-report-bug=${ifDefined(opts.attr === "bug" ? "" : undefined)}
      role=${ifDefined(isSwitch ? "switch" : undefined)}
      aria-checked=${ifDefined(isSwitch ? String(opts.switchState) : undefined)}
      class=${SettingsModal.ROW}
      @click=${opts.onClick}
    >
      <span
        class="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/4 text-white/70 transition-colors group-hover:border-brand-bright/40 group-hover:text-brand-bright group-focus-visible:border-brand-bright/40 group-focus-visible:text-brand-bright"
      >
        ${opts.icon}
      </span>
      <span class="min-w-0 flex-1">
        <span class="block text-sm font-semibold leading-tight">
          ${opts.title}
        </span>
        <span class="mt-0.5 block text-xs leading-snug text-white/50">
          ${opts.desc}
        </span>
      </span>
      ${opts.trailing ?? null}
    </button>`;
  }

  private renderSwitch(on: boolean) {
    return html`<span
      class="flex shrink-0 items-center gap-2 text-xs font-semibold ${on
        ? "text-brand-bright"
        : "text-white/45"}"
    >
      ${on
        ? translateText("user_setting.on")
        : translateText("user_setting.off")}
      <span
        class="relative h-5 w-9 rounded-full border transition-colors ${on
          ? "border-brand-bright/60 bg-brand"
          : "border-white/15 bg-plate-700"}"
      >
        <span
          class="absolute top-0.5 size-3.5 rounded-full bg-white shadow transition-all ${on
            ? "start-4.5"
            : "start-0.5"}"
        ></span>
      </span>
    </span>`;
  }

  private renderChevron() {
    return html`<span
      class="shrink-0 text-white/30 transition-colors group-hover:text-brand-bright rtl:rotate-180"
    >
      ${menuChevronIcon()}
    </span>`;
  }

  private renderGroup(label: string, rows: TemplateResult[], dev = false) {
    return html`<section
      class="flex flex-col gap-0.5 ${dev ? "opacity-80" : ""}"
      aria-label=${label}
    >
      <h3
        class="px-3 pb-1 pt-2 text-[0.6875rem] font-bold uppercase tracking-[0.14em] ${dev
          ? "text-capital/70"
          : "text-white/40"}"
      >
        ${label}
      </h3>
      ${rows}
    </section>`;
  }

  render() {
    if (!this.isVisible && !this.closing) {
      return null;
    }

    return html`
      <div
        class="modal-overlay game-menu-overlay fixed inset-0 z-2000 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
        ?data-closing=${!this.isVisible}
        ?inert=${!this.isVisible}
        @contextmenu=${(e: Event) => e.preventDefault()}
      >
        <div
          class="game-menu-panel flex max-h-[min(88dvh,640px)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-plate-900 shadow-2xl shadow-black/60 sm:rounded-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="game-menu-title"
        >
          <div
            class="h-0.5 shrink-0 bg-linear-to-r from-brand via-brand-bright to-capital"
            aria-hidden="true"
          ></div>
          <header
            class="flex shrink-0 items-center gap-3 border-b border-white/8 px-4 py-3.5"
          >
            <span
              class="flex size-10 items-center justify-center rounded-xl border border-brand-bright/30 bg-brand/15 text-brand-bright"
            >
              ${menuHexIcon(22)}
            </span>
            <h2
              id="game-menu-title"
              class="m-0 flex-1 font-display text-xl font-bold tracking-wide text-white"
            >
              ${translateText("user_setting.game_menu_title")}
            </h2>
            <kbd
              class="hidden rounded-md border border-white/15 bg-white/5 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-white/50 sm:inline-block"
              aria-hidden="true"
              >Esc</kbd
            >
            <button
              type="button"
              class="flex size-9 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-bright/80"
              aria-label=${translateText("common.close")}
              @click=${() => this.closeModal()}
            >
              ${menuCloseIcon()}
            </button>
          </header>

          <div
            class="flex flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
          >
            ${this.renderGroup(translateText("user_setting.menu_group_game"), [
              this.renderRow({
                icon: menuSlidersIcon(),
                title: translateText("user_setting.open_settings_label"),
                desc: translateText("user_setting.open_settings_desc"),
                attr: "settings",
                onClick: () => this.onOpenSettingsButtonClick(),
                trailing: this.renderChevron(),
              }),
              this.renderRow({
                icon: menuTerrainIcon(),
                title: translateText("user_setting.toggle_terrain"),
                desc: translateText("user_setting.toggle_view_desc"),
                switchState: this.alternateView,
                onClick: () => this.onTerrainButtonClick(),
                trailing: this.renderSwitch(this.alternateView),
              }),
            ])}
            ${this.renderGroup(translateText("user_setting.menu_group_help"), [
              this.renderRow({
                icon: menuBugIcon(),
                title: translateText("bug_report.title"),
                desc: translateText("bug_report.menu_desc"),
                attr: "bug",
                onClick: () => {
                  this.closeModal();
                  openBugReport();
                },
                trailing: this.renderChevron(),
              }),
              this.renderRow({
                icon: renderLinkIcon("ideas", "size-5"),
                title: translateText("links.ideas_title"),
                desc: translateText("links.ideas_desc"),
                onClick: () => {
                  this.closeModal();
                  openIdeas();
                },
                trailing: this.renderChevron(),
              }),
              this.renderRow({
                icon: renderLinkIcon("help", "size-5"),
                title: translateText("links.title"),
                desc: translateText("links.intro"),
                onClick: () => {
                  this.closeModal();
                  openLinks();
                },
                trailing: this.renderChevron(),
              }),
            ])}
            ${this.renderGroup(
              translateText("user_setting.development_only"),
              [
                this.renderRow({
                  icon: menuCodeIcon(),
                  title: translateText("user_setting.render_debug_gui"),
                  desc: translateText("user_setting.render_debug_gui_desc"),
                  onClick: () => this.onRenderDebugGuiButtonClick(),
                }),
              ],
              true,
            )}

            <div class="mt-1 border-t border-white/8 pt-2">
              <button
                type="button"
                data-menu-row
                data-exit-game
                class="group flex w-full items-center gap-3 rounded-xl border border-red-500/25 bg-red-500/8 px-3 py-2.5 text-start text-red-300 transition-colors hover:border-red-400/50 hover:bg-red-500/18 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/80 active:bg-red-500/25"
                @click=${() => this.onExitButtonClick()}
              >
                <span
                  class="flex size-9 shrink-0 items-center justify-center rounded-lg border border-red-400/25 bg-red-500/10"
                >
                  ${menuExitIcon()}
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block text-sm font-semibold leading-tight">
                    ${translateText("user_setting.exit_game_label")}
                  </span>
                  <span
                    class="mt-0.5 block text-xs leading-snug text-red-200/60"
                  >
                    ${translateText("user_setting.exit_game_info")}
                  </span>
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
