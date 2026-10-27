import { html, LitElement, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  copyToClipboard,
  getGamesPlayed,
  getTranslatedPlayerTeamLabel,
  homeHref,
  renderNumber,
  renderTroops,
  showToast,
  translateText,
} from "../../../client/Utils";
import { assetUrl } from "../../../core/AssetUrls";
import { Pattern } from "../../../core/CosmeticSchemas";
import { EventBus } from "../../../core/EventBus";
import {
  ColoredTeams,
  GameMode,
  GameType,
  PlayerType,
} from "../../../core/game/Game";
import {
  ConquestUpdate,
  GameUpdateType,
  UnitUpdate,
} from "../../../core/game/GameUpdates";
import { SURVIVAL_WAVES } from "../../../core/game/Survival";
import { responseHasLinkedIdentity } from "../../AccountIdentity";
import {
  fetchChallenges,
  fetchMyGameResult,
  getUserMe,
  invalidateUserMe,
  MyGameResult,
} from "../../Api";
import { challengeTaskKey } from "../../ChallengesModal";
import { ClientEnv } from "../../ClientEnv";
import "../../components/CosmeticCard";
import { cosmeticSelectionLabel } from "../../components/CosmeticPresentation";
import "../../components/PurchaseButton";
import { forgetActiveGame } from "../../components/ResumeGameButton";
import "../../components/SteamPromo";
import { Controller } from "../../Controller";
import {
  fetchCosmetics,
  purchaseCosmetic,
  resolveCosmetics,
} from "../../Cosmetics";
import { crazyGamesSDK } from "../../CrazyGamesSDK";
import { isDemo, openWishlist, recordDemoGame } from "../../Demo";
import { countDemo } from "../../DemoStats";
import { isDesktopShell } from "../../DesktopShell";
import { navigateTo } from "../../PageTransition";
import {
  joinedPublicType,
  PlayAgainTarget,
  requestPlayAgain,
} from "../../PlayAgain";
import { PlaySoundEffectEvent } from "../../sound/Sounds";
import { SendWinnerEvent } from "../../Transport";
import { GameView } from "../../view";
import {
  compareRecords,
  finishPlace,
  GameHighlights,
  HighlightKey,
  loadRecords,
  MIN_PLAYERS_FOR_PLACE_RECORD,
  nextGoal,
  pickHighlights,
  RecordKey,
  saveRecords,
} from "../EndScreen";
import { GameRecap, mainAttacker } from "../GameRecap";
import { reportGameEnd } from "./SteamAchievementsController";

@customElement("win-modal")
export class WinModal extends LitElement implements Controller {
  static readonly CLOSE_DELAY_SECONDS = 5;

  public game: GameView;
  public eventBus: EventBus;

  private hasShownDeathModal = false;
  private recap: GameRecap | null = null;

  @state()
  isVisible = false;

  @state()
  private isWin = false;

  @state()
  private isRankedGame = false;

  @state()
  private patternContent: TemplateResult | null = null;

  // Seconds before the buttons that close the modal respond: the end of a
  // game is when the three store items get a look, so the modal isn't
  // dismissed before they have even loaded.
  @state()
  private closeCountdown = 0;

  // What the finished game paid: "pending" while the API hasn't recorded it
  // yet, null when there is nothing to show (singleplayer, signed out, the
  // API never answered).
  @state()
  private gameResult: MyGameResult | "pending" | null = null;

  // The finished game's link, which opens its replay: shown once the game
  // has a winner and its record is kept (every multiplayer game, and the
  // singleplayer games of signed-in players).
  @state()
  private replayLink: string | null = null;

  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private resultRequested = false;

  private _title: string;

  private rand = Math.random();

  private readonly highlights = new GameHighlights();
  private winnerClientID: string | null = null;
  private recordsSaved = false;
  private goalRequested = false;

  // The finishing place, counted down from the last place to the real one.
  @state()
  private place: { place: number; total: number } | null = null;

  @state()
  private shownPlace = 0;

  @state()
  private pickedHighlights: { key: HighlightKey; value: number }[] = [];

  @state()
  private beatenRecords: RecordKey[] = [];

  @state()
  private goal: {
    task: string;
    target: number;
    progress: number;
    period: string;
  } | null = null;

  private placeTimer: ReturnType<typeof setInterval> | null = null;

  // Override to prevent shadow DOM creation
  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
  }

  render() {
    return html`
      <div
        class="${this.isVisible
          ? "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-plate-800/85 p-4 md:p-6 shrink-0 rounded-2xl border border-white/10 z-[10010] shadow-2xl backdrop-blur-xs text-white w-[min(92vw,720px)] max-h-[92dvh] overflow-hidden flex flex-col"
          : "hidden"}"
        data-end-screen
      >
        <h2 class="m-0 text-[26px] text-center text-white shrink-0">
          ${this._title || ""}
        </h2>
        ${this.renderPlace()}
        <div class="mt-3 min-h-0 flex-1 overflow-y-auto pr-0.5">
          ${this.renderRecords()} ${this.renderDemoWishlist()}
          ${this.renderGameResult()} ${this.renderGoal()}
          ${this.renderSurvivalReport()} ${this.renderRecap()}
          ${this.renderHighlights()} ${this.renderReplayShare()}
          ${isDemo() ? null : this.innerHtml()}
          <steam-promo
            variant="compact"
            campaign="winmodal"
            class="mt-3 block [&:empty]:hidden"
          ></steam-promo>
        </div>
        ${this.renderActions()}
      </div>
    `;
  }

  private renderActions() {
    const target = this.playAgainTarget();
    const me = this.game?.myPlayer();
    const watchLabel =
      me?.hasSpawned() && !me.isAlive() && !this.game.gameOver()
        ? translateText("win_modal.watch_end")
        : me?.isAlive()
          ? translateText("win_modal.keep")
          : translateText("win_modal.spectate");
    return html`<div class="mt-4 flex flex-col gap-2 shrink-0">
      ${target !== null
        ? html`<button
            type="button"
            data-win-play-again
            class="w-full rounded-xl bg-emerald-600 px-4 py-3 font-display text-lg font-bold text-white shadow-lg transition-colors hover:bg-emerald-500 active:bg-emerald-700"
            @click=${() => this._handlePlayAgain(target)}
          >
            ${translateText("win_modal.play_again")}
          </button>`
        : null}
      <div class="flex gap-2">
        <o-button
          variant="secondary"
          width="block"
          class="flex-1"
          data-win-watch
          .title=${this.withCountdown(watchLabel)}
          ?disable=${this.closeCountdown > 0}
          @click=${this.hide}
        ></o-button>
        <o-button
          variant="secondary"
          width="block"
          class="flex-1"
          data-win-exit
          .title=${this.withCountdown(translateText("win_modal.leave_game"))}
          ?disable=${this.closeCountdown > 0}
          @click=${this._handleExit}
        ></o-button>
      </div>
    </div>`;
  }

  // "#24 of 50": the place counts down to the real one as the screen opens.
  private renderPlace() {
    if (this.place === null) return null;
    const { place, total } = this.place;
    const color =
      this.shownPlace === 1
        ? "text-amber-300"
        : this.shownPlace <= 3
          ? "text-emerald-300"
          : "text-white";
    return html`<div
      data-win-place
      class="mt-2 flex items-baseline justify-center gap-3 shrink-0"
      role="img"
      aria-label=${translateText("win_modal.place_aria", { place, total })}
    >
      <span
        class="font-display text-6xl font-black tabular-nums leading-none ${color}"
        >#${this.shownPlace}</span
      >
      <span class="text-lg text-white/70"
        >${translateText("win_modal.place_of", { total })}</span
      >
    </div>`;
  }

  private renderRecords() {
    if (this.beatenRecords.length === 0) return null;
    return html`<div data-win-records class="mb-3 flex flex-wrap gap-2">
      ${this.beatenRecords.map(
        (key) =>
          html`<div
            class="flex flex-1 min-w-[12rem] items-center gap-2 rounded-xl border border-amber-300/50 bg-amber-400/15 px-3 py-2"
          >
            <img
              src=${assetUrl("images/MedalIcon.svg")}
              alt=""
              aria-hidden="true"
              class="size-6"
            />
            <div>
              <div class="text-xs font-bold text-amber-200">
                ${translateText("win_modal.record_new")}
              </div>
              <div class="text-sm text-white">
                ${translateText(`win_modal.record_${key}`)}
              </div>
            </div>
          </div>`,
      )}
    </div>`;
  }

  private renderHighlights() {
    if (this.pickedHighlights.length === 0) return null;
    return html`<div data-win-highlights class="mb-4">
      <h3 class="mb-2 text-center text-lg font-semibold text-white">
        ${translateText("win_modal.highlights_title")}
      </h3>
      <div class="grid gap-2 sm:grid-cols-3">
        ${this.pickedHighlights.map(
          (h) =>
            html`<div
              class="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-3 text-center"
            >
              <div class="text-2xl font-bold text-emerald-200">
                ${highlightValue(h.key, h.value)}
              </div>
              <div class="mt-1 text-sm text-white/80">
                ${translateText(`win_modal.highlight_${h.key}`)}
              </div>
            </div>`,
        )}
      </div>
    </div>`;
  }

  private renderGoal() {
    const g = this.goal;
    if (g === null) return null;
    const done = Math.min(g.progress, g.target);
    const pct = Math.round((100 * done) / g.target);
    return html`<div
      data-win-goal
      class="mb-4 rounded-xl border border-white/10 bg-black/30 px-3 py-2"
    >
      <div class="flex items-baseline justify-between gap-2 text-sm">
        <span class="font-bold text-white"
          >${translateText("win_modal.next_goal", {
            period: translateText(`challenges.${g.period}`),
          })}</span
        >
        <span class="tabular-nums text-white/70">${done}/${g.target}</span>
      </div>
      <div class="mt-0.5 text-sm text-white/80">
        ${translateText(`challenges.task_${g.task}`, { n: g.target })}
      </div>
      <div class="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          class="h-full rounded-full bg-emerald-400"
          style="width:${pct}%"
        ></div>
      </div>
    </div>`;
  }

  private renderReplayShare() {
    const link = this.replayLink;
    if (link === null) return null;
    return html`<div
      data-win-replay
      class="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2"
    >
      <img
        src=${assetUrl("images/ReplayRegularIconWhite.svg")}
        alt=""
        aria-hidden="true"
        class="w-5 h-5 opacity-80"
      />
      <span class="flex-1 min-w-[12rem] text-sm text-white/80">
        ${translateText("win_modal.replay_share_text")}
      </span>
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 px-3 py-1.5 text-sm font-bold text-white transition-colors"
        @click=${() => this.copyReplayLink(link)}
      >
        <img
          src=${assetUrl("images/LinkIconWhite.svg")}
          alt=""
          aria-hidden="true"
          class="w-4 h-4"
        />
        ${translateText("win_modal.replay_share")}
      </button>
    </div>`;
  }

  private async copyReplayLink(link: string) {
    try {
      await copyToClipboard(link);
      showToast(translateText("win_modal.replay_copied"), "green");
    } catch {
      showToast(translateText("common.failed_copy"), "red");
    }
  }

  // Offers the replay link once the game has a winner. A guest's singleplayer
  // game isn't kept, so its link would lead nowhere.
  private async offerReplayLink() {
    const gameID = this.game.gameID();
    if (this.game.config().gameConfig().gameType === GameType.Singleplayer) {
      const me = await getUserMe().catch(() => false as const);
      if (!responseHasLinkedIdentity(me)) return;
    }
    // shareOrigin(), not window.location.origin: the desktop shell's own
    // origin resolves nowhere outside the app.
    this.replayLink = `${ClientEnv.shareOrigin()}${ClientEnv.gamePath(gameID)}`;
  }

  // The demo's invitation to wishlist the full game.
  private renderDemoWishlist() {
    if (!isDemo()) return null;
    return html`<div
      data-demo-wishlist
      class="mb-4 flex flex-col items-center gap-3 rounded-lg border border-[#1a9fff]/40 bg-[#1a9fff]/10 px-4 py-4 text-center"
    >
      <div class="font-display text-lg font-bold text-white">
        ${translateText("demo.end_title")}
      </div>
      <div class="text-sm text-white/75">${translateText("demo.end_body")}</div>
      <button
        type="button"
        @click=${() => openWishlist("demo_end")}
        class="rounded-lg bg-[#1a9fff] px-5 py-2.5 font-display font-bold text-white transition-[filter] hover:brightness-110"
      >
        ${translateText("demo.wishlist")}
      </button>
    </div>`;
  }

  // Survival's end-of-game report: how far the defense held, who led it,
  // the land kept and the warlords brought down.
  private renderSurvivalReport() {
    if (!this.game?.config().isSurvivalMode() || !this.game.gameOver()) {
      return null;
    }
    const report = survivalReport(this.game);
    const stat = (label: string, value: string) =>
      html`<div class="rounded-sm bg-black/30 px-3 py-2">
        <div class="text-xs text-white/60">${label}</div>
        <div class="text-lg font-bold text-white">${value}</div>
      </div>`;
    return html`<div data-survival-report class="mb-4">
      <h3 class="mb-2 text-center text-lg font-semibold text-white">
        ${translateText("win_modal.survival_report_title")}
      </h3>
      <div class="grid grid-cols-2 gap-2">
        ${stat(
          translateText("win_modal.survival_wave_reached"),
          translateText("win_modal.survival_wave_value", {
            wave: report.wave,
            total: SURVIVAL_WAVES,
          }),
        )}
        ${stat(
          translateText("win_modal.survival_best_defender"),
          report.best === null
            ? "—"
            : translateText("win_modal.survival_best_defender_value", {
                name: report.best.name,
                count: report.best.eliminations,
              }),
        )}
        ${stat(
          translateText("win_modal.survival_land_held"),
          translateText("win_modal.survival_land_held_value", {
            share: report.landShare.toFixed(1),
          }),
        )}
        ${stat(
          translateText("win_modal.survival_warlords"),
          translateText("win_modal.survival_warlords_value", {
            down: report.warlordsDown,
            total: report.warlords,
          }),
        )}
      </div>
    </div>`;
  }

  private renderRecap() {
    const me = this.game?.myPlayer();
    if (!this.recap || !me || !me.hasSpawned()) return null;
    const s = this.recap.summary(me.isAlive());
    const killer =
      s.eliminatedBy !== null
        ? this.game.playerBySmallID(s.eliminatedBy)
        : null;
    const stat = (label: string, value: string) =>
      html`<div class="rounded-sm bg-black/30 px-3 py-2">
        <div class="text-xs text-white/60">${label}</div>
        <div class="text-lg font-bold text-white">${value}</div>
      </div>`;
    return html`<div data-win-recap class="mb-4">
      <h3 class="mb-2 text-center text-lg font-semibold text-white">
        ${translateText("win_modal.recap_title")}
      </h3>
      ${killer?.isPlayer()
        ? html`<div
            class="mb-2 rounded-sm border border-red-400/40 bg-red-500/15 px-3 py-2 text-center"
          >
            ${translateText("win_modal.recap_eliminated_by", {
              name: killer.displayName(),
            })}
          </div>`
        : null}
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
        ${stat(
          translateText("win_modal.recap_peak_size"),
          translateText("win_modal.recap_peak_size_value", {
            tiles: s.peakTiles.toLocaleString(),
            share: s.peakShare.toFixed(1),
          }),
        )}
        ${stat(
          translateText("win_modal.recap_peak_troops"),
          renderTroops(s.peakTroops),
        )}
        ${stat(
          translateText("win_modal.recap_best_minute"),
          s.bestMinuteGain > 0
            ? translateText("win_modal.recap_best_minute_value", {
                tiles: s.bestMinuteGain.toLocaleString(),
                time: clock(s.bestMinuteEnd),
              })
            : "—",
        )}
        ${stat(
          translateText("win_modal.recap_attacks"),
          s.attacksLaunched.toLocaleString(),
        )}
        ${stat(translateText("win_modal.recap_time"), clock(s.secondsPlayed))}
      </div>
    </div>`;
  }

  private withCountdown(label: string): string {
    return this.closeCountdown > 0
      ? `${label} (${this.closeCountdown})`
      : label;
  }

  private renderGameResult() {
    if (this.gameResult === null) return null;
    if (this.gameResult === "pending") {
      return html`<div
        data-win-medals
        class="mb-4 rounded-sm bg-black/30 p-3 text-center text-white/70"
      >
        ${translateText("win_modal.medals_pending")}
      </div>`;
    }
    return html`<div
      data-win-medals
      class="mb-4 flex items-center justify-center gap-3 rounded-sm border border-amber-300/30 bg-amber-400/10 p-3"
    >
      <img src=${assetUrl("images/MedalIcon.svg")} alt="" class="size-8" />
      <span class="text-2xl font-bold text-amber-200"
        >+${this.gameResult.soft.toLocaleString()}</span
      >
      <span class="text-white/80"
        >${this.gameResult.soft > 0
          ? translateText("win_modal.medals_earned")
          : translateText("win_modal.medals_none")}</span
      >
    </div>`;
  }

  // Asks the API what the finished game paid. The game server posts the game
  // once the winner vote resolves, so the answer takes a few seconds: poll.
  private async loadGameResult() {
    if (this.resultRequested) return;
    this.resultRequested = true;
    const config = this.game.config().gameConfig();
    if (config.gameType === GameType.Singleplayer) return;
    const me = await getUserMe().catch(() => false as const);
    if (!me) return;
    this.gameResult = "pending";
    for (let attempt = 0; attempt < 12; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      const result = await fetchMyGameResult(this.game.gameID());
      if (result) {
        this.gameResult = result;
        // The balance in the menus changed.
        if (result.soft > 0) invalidateUserMe();
        return;
      }
    }
    this.gameResult = null;
  }

  private startCloseCountdown() {
    if (this.countdownTimer !== null) clearInterval(this.countdownTimer);
    this.closeCountdown = WinModal.CLOSE_DELAY_SECONDS;
    this.countdownTimer = setInterval(() => {
      this.closeCountdown--;
      if (this.closeCountdown <= 0 && this.countdownTimer !== null) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
      }
    }, 1000);
  }

  innerHtml() {
    if (!this.isWin && getGamesPlayed() < 3) {
      return this.renderTips();
    }
    return this.renderPatternButton();
  }

  renderTips() {
    const tips = ["tip_wilderness", "tip_cities", "tip_alliances"];
    return html`
      <div class="text-left mb-6 bg-black/30 p-3 rounded-sm">
        <h3 class="text-xl font-semibold text-white mb-3 text-center">
          ${translateText("win_modal.tips_title")}
        </h3>
        <ul class="list-disc pl-5 space-y-1.5 text-white/90 text-sm">
          ${tips.map((t) => html`<li>${translateText(`win_modal.${t}`)}</li>`)}
        </ul>
        <p class="mt-3 text-xs text-white/60 text-center">
          ${translateText("win_modal.tips_help")}
        </p>
      </div>
    `;
  }

  renderPatternButton() {
    return html`
      <div class="text-center mb-6 bg-black/30 p-2.5 rounded-sm">
        <h3 class="text-xl font-semibold text-white mb-3">
          ${translateText("win_modal.shop_title")}
        </h3>
        ${isDesktopShell()
          ? null
          : html`<p class="text-white mb-3">
              ${translateText("win_modal.territory_pattern")}
            </p>`}
        <div
          class="mx-auto w-full overflow-x-auto overflow-y-visible rounded-sm"
        >
          <div
            class="flex min-w-max items-start justify-center gap-4 px-1 py-1"
          >
            ${this.patternContent}
          </div>
        </div>
      </div>
    `;
  }

  async loadPatternContent() {
    const me = await getUserMe();
    const cosmetics = await fetchCosmetics();

    const purchasable = resolveCosmetics(cosmetics, me, null).filter(
      (r) => SHOP_TYPES.has(r.type) && r.relationship === "purchasable",
    );

    if (purchasable.length === 0) {
      this.patternContent = html``;
      return;
    }

    // Three items the player doesn't own yet, of different kinds when the
    // store has them, so each game shows something new.
    const shuffled = pickHighlights(purchasable, purchasable.length);
    const selected = [
      ...shuffled.filter(
        (r, i) => shuffled.findIndex((o) => o.type === r.type) === i,
      ),
      ...shuffled,
    ]
      .filter((r, i, all) => all.indexOf(r) === i)
      .slice(0, 3);

    this.patternContent = html`
      <div class="flex gap-4 flex-nowrap justify-start items-start">
        ${selected.map((resolved) => {
          // Every kind kept above carries a price and a rarity.
          const pattern = resolved.cosmetic as Pattern | null;
          return html`
            <div data-win-cosmetic-promo class="flex w-40 flex-col gap-2">
              <cosmetic-card
                .resolved=${resolved}
                .interactive=${false}
              ></cosmetic-card>
              <purchase-button
                .priceHard=${pattern?.priceHard ?? null}
                .priceSoft=${pattern?.priceSoft ?? null}
                .rarity=${pattern?.rarity ?? "common"}
                .itemName=${cosmeticSelectionLabel(resolved)}
                .onPurchaseHard=${() => purchaseCosmetic(resolved, "hard")}
                .onPurchaseSoft=${() => purchaseCosmetic(resolved, "soft")}
              ></purchase-button>
            </div>
          `;
        })}
      </div>
    `;
  }

  async show() {
    // The game is over: nothing to go back to from the main menu.
    forgetActiveGame();
    crazyGamesSDK.gameplayStop();
    reportGameEnd(this.isWin);
    if (isDemo()) {
      recordDemoGame(this.game.gameID(), {
        won: this.isWin,
        wave: this.game.config().isSurvivalMode()
          ? survivalReport(this.game).wave
          : undefined,
        tutorial: this.game.config().gameConfig().gameVariant === "training",
      });
    }
    this.isRankedGame =
      this.game.config().gameConfig().rankedType !== undefined;
    this.prepareEndScreen();
    this.isVisible = true;
    this.startCloseCountdown();
    this.requestUpdate();
    try {
      await this.loadPatternContent();
    } catch (error) {
      console.warn("Failed to load win modal cosmetics", error);
      return;
    }
    this.requestUpdate();
  }

  // Works out what the screen tells: the place, the highlights, the records
  // beaten. Runs at each show (elimination, then the game's end).
  private prepareEndScreen() {
    const config = this.game.config();
    const myPlayer = this.game.myPlayer();
    const placed =
      config.gameConfig().gameMode === GameMode.FFA && !config.isSurvivalMode()
        ? finishPlace(
            this.game
              .players()
              .filter((p) => p.type() !== PlayerType.Bot)
              .map((p) => ({
                isMe: p === myPlayer,
                isWinner:
                  this.winnerClientID !== null &&
                  p.clientID() === this.winnerClientID,
                alive: p.isAlive(),
                spawned: p.hasSpawned(),
                tiles: p.numTilesOwned(),
                deathPosition: p.deathPosition(),
              })),
          )
        : null;
    if (placed !== null && placed.place !== this.place?.place) {
      this.place = placed;
      this.animatePlace(placed);
    }
    if (this.pickedHighlights.length === 0) {
      this.pickedHighlights = pickHighlights(this.highlights.candidates(), 3);
    }
    if (!this.recordsSaved && this.recap !== null && myPlayer?.hasSpawned()) {
      this.recordsSaved = true;
      const s = this.recap.summary(myPlayer.isAlive());
      const { beaten, next } = compareRecords(loadRecords(), {
        place:
          placed !== null && placed.total >= MIN_PLAYERS_FOR_PLACE_RECORD
            ? placed.place
            : null,
        peakShare: s.peakShare,
        survivalSeconds: s.secondsPlayed,
        eliminations: this.highlights.value("eliminations"),
        biggestAttack: this.highlights.value("biggest_attack"),
      });
      saveRecords(next);
      this.beatenRecords = beaten;
    }
    void this.loadGoal();
  }

  private animatePlace(placed: { place: number; total: number }) {
    if (this.placeTimer !== null) clearInterval(this.placeTimer);
    this.placeTimer = null;
    const reduced =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || placed.total === placed.place) {
      this.shownPlace = placed.place;
      return;
    }
    // About a second and a half, whatever the lobby size, slowing down at
    // the end.
    const steps = 30;
    let step = 0;
    this.shownPlace = placed.total;
    this.placeTimer = setInterval(() => {
      step++;
      const t = 1 - (1 - step / steps) ** 3;
      this.shownPlace = Math.round(
        placed.total - (placed.total - placed.place) * t,
      );
      if (step >= steps && this.placeTimer !== null) {
        clearInterval(this.placeTimer);
        this.placeTimer = null;
        this.shownPlace = placed.place;
      }
    }, 50);
  }

  // The unfinished challenge closest to done, for signed-in players.
  private async loadGoal() {
    if (this.goalRequested) return;
    this.goalRequested = true;
    const me = await getUserMe().catch(() => false as const);
    if (!responseHasLinkedIdentity(me)) return;
    const data = await fetchChallenges().catch(() => false as const);
    if (!data) return;
    const goal = nextGoal(
      data.challenges.flatMap((c) => (c.kind === "multi" ? [c] : [])),
    );
    if (goal === null) return;
    this.goal = {
      task: challengeTaskKey(goal.template),
      target: goal.target,
      progress: goal.progress,
      period: goal.period,
    };
  }

  // Ranked games go back into the queue, solo games to a new solo game,
  // public games to the next lobby of the same list. Private lobbies have
  // their own "next lobby" prompt.
  private playAgainTarget(): PlayAgainTarget | "ranked" | null {
    if (this.game === undefined || this.game.config().isReplay()) return null;
    const config = this.game.config().gameConfig();
    if (config.rankedType !== undefined) return "ranked";
    if (config.gameType === GameType.Singleplayer) {
      return config.gameVariant === "training" ? null : "solo";
    }
    return joinedPublicType(this.game.gameID());
  }

  private _handlePlayAgain(target: PlayAgainTarget | "ranked") {
    if (target === "ranked") {
      this._handleRequeue();
      return;
    }
    this.hide();
    requestPlayAgain(target);
    navigateTo(homeHref());
  }

  hide() {
    this.isVisible = false;
    this.requestUpdate();
  }

  private _handleExit() {
    this.hide();
    navigateTo(homeHref());
  }

  private _handleRequeue() {
    this.hide();
    // Requeue for the same mode; Main owns the mechanism (currently a
    // reload with the requeue param, which reopens the queue after the
    // page teardown).
    document.dispatchEvent(
      new CustomEvent("matchmaking-requeue", {
        detail: { mode: "ffa" as const },
      }),
    );
  }

  init() {
    // The demo's admin counts: a game of this mode started.
    const variant = this.game.config().gameConfig().gameVariant;
    countDemo(
      `started_${variant === "survival" ? "survival" : variant === "training" ? "tutorial" : "solo"}`,
    );
  }

  tick() {
    const myPlayer = this.game.myPlayer();
    this.sampleRecap();
    if (
      !this.hasShownDeathModal &&
      myPlayer &&
      !myPlayer.isAlive() &&
      !this.game.inSpawnPhase() &&
      myPlayer.hasSpawned()
    ) {
      this.hasShownDeathModal = true;
      this._title = translateText("win_modal.died");
      this.eventBus.emit(new PlaySoundEffectEvent("defeat"));
      this.show();
    }
    const updates = this.game.updatesSinceLastTick();
    this.feedHighlights(
      updates?.[GameUpdateType.Unit] as UnitUpdate[] | undefined,
      updates?.[GameUpdateType.ConquestEvent] as ConquestUpdate[] | undefined,
    );
    const winUpdates = updates?.[GameUpdateType.Win] ?? [];
    winUpdates.forEach((wu) => {
      if (wu.winner !== undefined) {
        void this.loadGameResult();
        void this.offerReplayLink();
      }
      if (wu.winner === undefined) {
        // Match cancelled (e.g. a ranked 2v2 that didn't fill or fully
        // spawn): the game ends with no winner. Still vote the result to the
        // server so the record is archived winnerless (never ranked).
        this.eventBus.emit(new SendWinnerEvent(undefined, wu.allPlayersStats));
        this._title = translateText("win_modal.match_cancelled");
        this.isWin = false;
        history.replaceState(null, "", `${window.location.pathname}?replay`);
        this.show();
      } else if (wu.winner[0] === "team") {
        this.eventBus.emit(new SendWinnerEvent(wu.winner, wu.allPlayersStats));
        if (this.game.config().isSurvivalMode()) {
          this.isWin = wu.winner[1] === ColoredTeams.Humans;
          this._title = translateText(
            this.isWin ? "win_modal.survival_won" : "win_modal.survival_lost",
          );
          if (this.isWin) crazyGamesSDK.happytime();
        } else if (wu.winner[1] === this.game.myPlayer()?.team()) {
          this._title = translateText("win_modal.your_team");
          this.isWin = true;
          crazyGamesSDK.happytime();
        } else {
          this._title = translateText("win_modal.other_team", {
            team: getTranslatedPlayerTeamLabel(wu.winner[1]),
          });
          this.isWin = false;
        }
        this.playEndOfGameSound();
        history.replaceState(null, "", `${window.location.pathname}?replay`);
        this.show();
      } else if (wu.winner[0] === "nation") {
        this.eventBus.emit(new SendWinnerEvent(wu.winner, wu.allPlayersStats));
        this._title = translateText("win_modal.nation_won", {
          nation: wu.winner[1],
        });
        this.isWin = false;
        this.playEndOfGameSound();
        this.show();
      } else {
        const winner = this.game.playerByClientID(wu.winner[1]);
        if (!winner?.isPlayer()) return;
        this.winnerClientID = winner.clientID();
        const winnerClient = winner.clientID();
        if (winnerClient !== null) {
          this.eventBus.emit(
            new SendWinnerEvent(["player", winnerClient], wu.allPlayersStats),
          );
        }
        if (
          winnerClient !== null &&
          winnerClient === this.game.myPlayer()?.clientID()
        ) {
          this._title = translateText("win_modal.you_won");
          this.isWin = true;
          crazyGamesSDK.happytime();
        } else {
          this._title = translateText("win_modal.other_won", {
            player: winner.displayName(),
          });
          this.isWin = false;
        }
        this.playEndOfGameSound();
        history.replaceState(null, "", `${window.location.pathname}?replay`);
        this.show();
      }
    });
  }

  private feedHighlights(
    units: UnitUpdate[] | undefined,
    conquests: ConquestUpdate[] | undefined,
  ): void {
    const me = this.game.myPlayer();
    if (!me) return;
    const mine = me.smallID();
    for (const u of units ?? []) {
      this.highlights.unit(u.id, u.unitType, u.ownerID, mine);
    }
    for (const c of conquests ?? []) {
      this.highlights.conquest(c.conquerorId === me.id());
    }
  }

  // One sample per game second of the local player, while they play.
  private sampleRecap(): void {
    const me = this.game.myPlayer();
    if (!me || !me.hasSpawned() || !me.isAlive() || this.game.inSpawnPhase()) {
      return;
    }
    const sinceStart =
      this.game.ticks() - this.game.config().numSpawnPhaseTurns();
    if (sinceStart % 10 !== 0) return;
    this.recap ??= new GameRecap(this.game.numLandTiles());
    this.highlights.sample(
      me.outgoingAttacks().map((a) => a.troops),
      me.incomingAttacks().map((a) => a.id),
      Number(me.gold()),
    );
    this.recap.add({
      second: sinceStart / 10,
      tiles: me.numTilesOwned(),
      troops: me.troops(),
      mainAttacker: mainAttacker(me.incomingAttacks()),
      outgoingAttackIDs: me.outgoingAttacks().map((a) => a.id),
    });
  }

  private playEndOfGameSound(): void {
    if (this.isWin) {
      this.eventBus.emit(new PlaySoundEffectEvent("victory"));
    } else if (!this.hasShownDeathModal && this.game.myPlayer()?.hasSpawned()) {
      // Spawned check: spectators and replay viewers shouldn't get a
      // personal defeat sting. The cue also already played if the player
      // died earlier (hasShownDeathModal).
      this.eventBus.emit(new PlaySoundEffectEvent("defeat"));
    }
  }
}

/** What the Survival report shows, from the game's Survival status. */
export function survivalReport(game: GameView): {
  wave: number;
  best: { name: string; eliminations: number } | null;
  landShare: number;
  warlords: number;
  warlordsDown: number;
} {
  const status = game.survivalStatus();
  let best: { name: string; eliminations: number } | null = null;
  for (const [smallID, count] of Object.entries(status.eliminations)) {
    const p = game.playerBySmallID(Number(smallID));
    if (!p.isPlayer() || count <= (best?.eliminations ?? 0)) continue;
    best = { name: p.displayName(), eliminations: count };
  }
  const held = game
    .players()
    .filter((p) => p.type() === PlayerType.Human)
    .reduce((sum, p) => sum + p.numTilesOwned(), 0);
  const warlordsDown = status.bosses.filter((b) => {
    const p = game.playerBySmallID(b.smallID);
    return p.isPlayer() && !p.isAlive();
  }).length;
  return {
    wave: status.wavesLanded,
    best,
    landShare: (100 * held) / Math.max(1, game.numLandTiles()),
    warlords: status.bosses.length,
    warlordsDown,
  };
}

// The store items the end screen may offer: single cosmetics, not bundles.
const SHOP_TYPES = new Set(["pattern", "skin", "flag", "crown", "effect"]);

function highlightValue(key: HighlightKey, value: number): string {
  if (key === "biggest_attack") return renderTroops(value);
  if (key === "peak_gold") return renderNumber(value);
  return value.toLocaleString();
}

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
