import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  VERSUS_TEAM_SIZES,
  versusGameType,
  versusMap,
  VersusTeamSize,
} from "../../core/game/Versus";
import { PublicGames } from "../../core/Schemas";
import { getMapName, translateText } from "../Utils";
import { BaseModal } from "./BaseModal";
import { modalHeader } from "./ui/ModalHeader";
import { versusRules, versusZoneMap } from "./VersusLobby";

export type VersusPlayMode = "public" | "private";

/** Asks the home page to join a format's public lobby or host a private one. */
export interface VersusPlayDetail {
  teamSize: VersusTeamSize;
  mode: VersusPlayMode;
}

// The lobby feed only reaches the home page, which rebroadcasts each update;
// keep the latest one so the page opens with the queues already filled in.
let latestLobbies: PublicGames | null = null;
document.addEventListener("public-lobbies-update", (e) => {
  latestLobbies = (e as CustomEvent<{ payload: PublicGames }>).detail.payload;
});

// The "Versus" page: the four formats, their fixed rules, and the buttons
// that join a public game or create a private one.
@customElement("versus-modal")
export class VersusModal extends BaseModal {
  protected routerName = "versus";

  @state() private teamSize: VersusTeamSize = 1;
  @state() private lobbies: PublicGames | null = latestLobbies;

  private readonly onLobbies = (e: Event) => {
    this.lobbies = (e as CustomEvent<{ payload: PublicGames }>).detail.payload;
  };

  constructor() {
    super();
    this.id = "page-versus";
  }

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("public-lobbies-update", this.onLobbies);
  }

  disconnectedCallback() {
    document.removeEventListener("public-lobbies-update", this.onLobbies);
    super.disconnectedCallback();
  }

  protected override onOpen(): void {
    this.lobbies = latestLobbies;
  }

  /** Players waiting in a format's public lobby. */
  private waiting(teamSize: VersusTeamSize): number {
    const lobby = this.lobbies?.games?.[versusGameType(teamSize)]?.[0];
    return lobby?.numClients ?? 0;
  }

  private play(mode: VersusPlayMode) {
    document.dispatchEvent(
      new CustomEvent<VersusPlayDetail>("versus-play", {
        detail: { teamSize: this.teamSize, mode },
      }),
    );
  }

  protected renderHeaderSlot() {
    return modalHeader({
      title: translateText("game_modes.versus_title"),
      onBack: () => this.close(),
      ariaLabel: translateText("common.back"),
    });
  }

  protected renderBody() {
    return html`
      <div class="custom-scrollbar flex flex-col gap-5 p-4 sm:p-6">
        <p class="max-w-2xl text-sm text-white/75">
          ${translateText("versus.intro")}
        </p>
        <div
          class="grid grid-cols-2 gap-3 lg:grid-cols-4"
          role="radiogroup"
          aria-label=${translateText("game_modes.versus_open")}
        >
          ${VERSUS_TEAM_SIZES.map((size) => this.renderFormat(size))}
        </div>
        ${this.renderSelected()}
      </div>
    `;
  }

  private renderFormat(size: VersusTeamSize) {
    const selected = size === this.teamSize;
    const waiting = this.waiting(size);
    return html`<button
      type="button"
      role="radio"
      aria-checked=${selected}
      class="flex flex-col items-center gap-2 rounded-xl border-2 p-3 text-white transition-colors focus-visible:outline-2 focus-visible:outline-white ${selected
        ? "border-white bg-white/15"
        : "border-white/10 bg-white/5 hover:border-white/40"}"
      @click=${() => (this.teamSize = size)}
    >
      <div class="w-24 sm:w-28">${versusZoneMap(size)}</div>
      <span class="font-display text-3xl font-bold tracking-wide"
        >${versusGameType(size)}</span
      >
      <span class="text-xs text-white/60">${getMapName(versusMap(size))}</span>
      <span
        class="rounded-full px-2 py-0.5 text-xs ${waiting > 0
          ? "bg-emerald-500/20 text-emerald-300"
          : "bg-white/5 text-white/50"}"
      >
        ${translateText("versus.queue", {
          count: waiting,
          max: size * 2,
        })}
      </span>
    </button>`;
  }

  private renderSelected() {
    const size = this.teamSize;
    // The server opens the next public lobby as soon as one fills up.
    const open = this.lobbies?.games?.[versusGameType(size)]?.[0] !== undefined;
    return html`<section
      class="grid gap-5 rounded-xl border border-white/10 bg-black/30 p-4 sm:p-5 md:grid-cols-[1fr_16rem]"
    >
      <div class="flex flex-col gap-3">
        <h3 class="font-display text-2xl font-bold tracking-wide text-white">
          ${translateText("versus.format_title", {
            format: versusGameType(size),
          })}
        </h3>
        <ul class="flex flex-col gap-1.5 text-sm text-white/80">
          ${versusRules(size).map(
            (rule) =>
              html`<li class="flex items-start gap-2">
                <span
                  class="mt-1.5 size-1.5 shrink-0 rotate-45 bg-white/60"
                  aria-hidden="true"
                ></span>
                ${rule}
              </li>`,
          )}
        </ul>
      </div>
      <div class="flex flex-col gap-3 md:justify-end">
        <button
          type="button"
          class="rounded-lg bg-emerald-600 px-4 py-3 text-base font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40"
          ?disabled=${!open}
          @click=${() => this.play("public")}
        >
          ${open
            ? translateText("versus.play_public")
            : translateText("versus.queue_opening")}
        </button>
        <p class="text-xs text-white/55">
          ${translateText("versus.play_public_hint")}
        </p>
        <button
          type="button"
          class="rounded-lg bg-white/10 px-4 py-3 text-base font-bold text-white hover:bg-white/20"
          @click=${() => this.play("private")}
        >
          ${translateText("versus.play_private")}
        </button>
        <p class="text-xs text-white/55">
          ${translateText("versus.play_private_hint")}
        </p>
      </div>
    </section>`;
  }
}
