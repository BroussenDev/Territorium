import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { PublicGames } from "../core/Schemas";
import { ClientEnv } from "./ClientEnv";
import { BaseModal } from "./components/BaseModal";
import "./components/GameModeCards";
import { modalHeader } from "./components/ui/ModalHeader";
import {
  MAX_PINNED_MODES,
  MODE_KEYS,
  type ModeKey,
  pinnedModes,
  togglePinnedMode,
} from "./GameModes";
import { calculateServerTimeOffset, showToast, translateText } from "./Utils";

// The Modes page: every game mode with rules of its own, in full, each with a
// pin to keep it on the home page. Lobbies come from the home page's live
// feed (its "public-lobbies-update"); joining goes back through it.

@customElement("game-modes-page")
export class GameModesPage extends BaseModal {
  protected routerName = "modes";

  @state() private lobbies: PublicGames | null = null;
  @state() private pinned: ModeKey[] = pinnedModes();
  private serverTimeOffset = 0;
  private readonly defaultLobbyTime = ClientEnv.gameCreationRate() / 1000;

  constructor() {
    super();
    this.id = "page-game-modes";
  }

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("public-lobbies-update", this.onLobbies);
    this.addEventListener("mode-pin", this.onPin);
  }

  disconnectedCallback() {
    document.removeEventListener("public-lobbies-update", this.onLobbies);
    this.removeEventListener("mode-pin", this.onPin);
    super.disconnectedCallback();
  }

  private onLobbies = (e: Event) => {
    const lobbies = (e as CustomEvent<{ payload: PublicGames }>).detail.payload;
    this.lobbies = lobbies;
    this.serverTimeOffset = calculateServerTimeOffset(lobbies.serverTime);
  };

  private onPin = (e: Event) => {
    const mode = (e as CustomEvent<ModeKey>).detail;
    if (!togglePinnedMode(mode)) {
      showToast(
        translateText("game_modes.pin_limit", { max: MAX_PINNED_MODES }),
        "red",
      );
      return;
    }
    this.pinned = pinnedModes();
    window.dispatchEvent(new CustomEvent("mode-pins-changed"));
  };

  protected override onOpen(): void {
    this.pinned = pinnedModes();
  }

  protected renderBody() {
    return html`
      <div class="flex flex-col h-full min-h-0">
        ${modalHeader({
          title: translateText("game_modes.title"),
          onBack: () => this.close(),
          ariaLabel: translateText("common.back"),
        })}
        <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 lg:p-6">
          <div class="mb-4 flex flex-col gap-1">
            <p class="font-display text-lg font-semibold text-white">
              ${translateText("game_modes.subtitle")}
            </p>
            <p class="max-w-3xl text-sm leading-relaxed text-white/60">
              ${translateText("game_modes.page_intro", {
                max: MAX_PINNED_MODES,
              })}
            </p>
          </div>
          <div class="grid gap-4 sm:grid-cols-3">
            <game-mode-cards
              class="contents"
              variant="full"
              .modes=${MODE_KEYS}
              .pinned=${this.pinned}
              .lobbies=${this.lobbies}
              .serverTimeOffset=${this.serverTimeOffset}
              .defaultLobbyTime=${this.defaultLobbyTime}
            ></game-mode-cards>
          </div>
        </div>
      </div>
    `;
  }
}
