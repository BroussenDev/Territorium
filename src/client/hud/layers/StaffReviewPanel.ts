import { html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { isAdminRole, isStaffRole } from "../../../core/ApiSchemas";
import { EventBus } from "../../../core/EventBus";
import { PlayerType, UnitType } from "../../../core/game/Game";
import { userAuth } from "../../Auth";
import { Controller } from "../../Controller";
import { MapRenderer } from "../../render/gl";
import { replayUrlAt } from "../../ReplaySeek";
import { GoToPlayerEvent } from "../../TransformHandler";
import { SendKickPlayerIntentEvent } from "../../Transport";
import { renderTroops, translateText } from "../../Utils";
import { GameView, PlayerView } from "../../view";

/**
 * The player a replay link asks to review: ?focus=<clientID>, as the admin
 * panel's report tickets open it. Null when there is none.
 */
export function reviewFocus(
  search: string = typeof window === "undefined" ? "" : window.location.search,
): string | null {
  const raw = new URLSearchParams(search).get("focus");
  return raw !== null && /^[A-Za-z0-9_-]{1,32}$/.test(raw) ? raw : null;
}

const UNITS: { type: UnitType; key: string }[] = [
  { type: UnitType.City, key: "unit_type.city" },
  { type: UnitType.Port, key: "unit_type.port" },
  { type: UnitType.Factory, key: "unit_type.factory" },
  { type: UnitType.DefensePost, key: "unit_type.defense_post" },
  { type: UnitType.MissileSilo, key: "unit_type.missile_silo" },
  { type: UnitType.SAMLauncher, key: "unit_type.sam_launcher" },
  { type: UnitType.Warship, key: "unit_type.warship" },
];

/**
 * The staff's eye on a game.
 *
 * In a replay opened from a report ticket (?focus=): the reported player's
 * border drawn red, what they hold as the game goes (troops, gold, land,
 * buildings, allies), a camera jump to them, the other players to switch
 * to, and the link to this exact moment for the ticket. It shows nothing a
 * replay doesn't already.
 *
 * In a live game, for a moderator's account (mod, admin) watching as a
 * spectator: the same watch on any player, and removing them from the game
 * (the server checks the role too, SocketIngress and IntentAuthorization).
 * A moderator who plays the game doesn't get it; an admin does.
 */
@customElement("staff-review-panel")
export class StaffReviewPanel extends LitElement implements Controller {
  public game!: GameView;
  public eventBus!: EventBus;
  public view!: MapRenderer;

  @state() private watchedID: string | null = null;
  // A moderator watching a live game: the menu shows, a player or not.
  @state() private liveStaff = false;
  // Admins keep the menu while they play too.
  @state() private liveAdmin = false;
  @state() private collapsed = false;
  @state() private copied = false;
  // Bumped each controller tick so the figures follow the game.
  @state() private refresh = 0;

  createRenderRoot() {
    return this;
  }

  init() {
    this.watchedID = this.game.config().isReplay() ? reviewFocus() : null;
    this.liveStaff = false;
    this.liveAdmin = false;
    this.collapsed = false;
    this.applyFocus();
    if (!this.game.config().isReplay()) {
      void userAuth().then((auth) => {
        this.liveStaff = auth !== false && isStaffRole(auth.claims.role);
        this.liveAdmin = auth !== false && isAdminRole(auth.claims.role);
        this.collapsed = true;
      });
    }
  }

  // Live games: moderators only while watching, admins always.
  private liveMenu(): boolean {
    return (
      this.liveStaff &&
      !this.game.config().isReplay() &&
      (this.liveAdmin || this.game.myPlayer() === null)
    );
  }

  getTickIntervalMs() {
    return 500;
  }

  // Refreshes the figures, and keeps the red border on the watched player
  // (their small ID is only known once they spawned).
  tick() {
    if (this.watchedID === null && !this.liveMenu()) return;
    this.applyFocus();
    this.refresh++;
  }

  private watched(): PlayerView | null {
    if (this.watchedID === null) return null;
    return this.game.playerByClientID(this.watchedID);
  }

  private applyFocus() {
    this.view?.setWatchOwner(this.watched()?.smallID() ?? 0);
  }

  private setFocus(clientID: string) {
    this.watchedID = clientID === "" ? null : clientID;
    if (this.game.config().isReplay()) {
      const url = new URL(window.location.href);
      url.searchParams.set("focus", clientID);
      history.replaceState(history.state, "", url.toString());
    }
    this.applyFocus();
    const p = this.watched();
    if (p) this.eventBus.emit(new GoToPlayerEvent(p));
  }

  private kick(p: PlayerView) {
    const id = p.clientID();
    if (id === null) return;
    if (
      !confirm(
        translateText("staff_review.kick_confirm", { name: p.displayName() }),
      )
    )
      return;
    this.eventBus.emit(new SendKickPlayerIntentEvent(id));
  }

  private async copyMoment() {
    const url = replayUrlAt(window.location.href, this.game.ticks());
    try {
      await navigator.clipboard.writeText(url);
      this.copied = true;
      setTimeout(() => (this.copied = false), 2000);
    } catch {
      window.prompt(translateText("staff_review.copy_link"), url);
    }
  }

  private stat(label: string, value: string) {
    return html`<div class="flex justify-between gap-3">
      <span class="text-white/55">${label}</span
      ><span class="font-mono text-white">${value}</span>
    </div>`;
  }

  render() {
    void this.refresh;
    if (!this.game) return nothing;
    const live = this.liveMenu();
    if (this.watchedID === null && !live) return nothing;
    const p = this.watched();
    const land = this.game.numLandTiles();
    const humans = this.game
      .players()
      .filter((x) => x.type() === PlayerType.Human && x.clientID() !== null);
    return html`
      <div
        class="pointer-events-auto fixed left-2 top-20 z-[60] w-72 max-w-[calc(100vw-1rem)] rounded-xl border border-red-500/40 bg-plate-800/95 text-sm text-white shadow-2xl backdrop-blur-sm"
        @contextmenu=${(e: Event) => e.preventDefault()}
      >
        <button
          class="flex w-full items-center gap-2 rounded-t-xl bg-red-500/15 px-3 py-2 text-left font-bold"
          @click=${() => (this.collapsed = !this.collapsed)}
          aria-expanded=${!this.collapsed}
        >
          <span class="h-2.5 w-2.5 rounded-full bg-red-500"></span>
          ${translateText("staff_review.title")}
          <span class="ml-auto text-white/50"
            >${this.collapsed ? "+" : "−"}</span
          >
        </button>
        ${this.collapsed
          ? nothing
          : html`<div class="flex flex-col gap-3 p-3">
              ${p === null
                ? html`<p class="text-white/60">
                    ${translateText(
                      live && this.watchedID === null
                        ? "staff_review.pick_player"
                        : "staff_review.not_spawned",
                    )}
                  </p>`
                : html`
                    <div>
                      <div class="truncate text-base font-bold">
                        ${p.displayName()}
                      </div>
                      <div class="text-xs text-white/50">
                        ${p.isAlive()
                          ? translateText("staff_review.alive")
                          : translateText("staff_review.eliminated")}
                        · ${this.watchedID}
                      </div>
                    </div>
                    <div class="flex flex-col gap-1">
                      ${this.stat(
                        translateText("staff_review.troops"),
                        renderTroops(p.troops()),
                      )}
                      ${this.stat(
                        translateText("staff_review.gold"),
                        Number(p.gold()).toLocaleString(),
                      )}
                      ${this.stat(
                        translateText("staff_review.land"),
                        `${p.numTilesOwned().toLocaleString()} (${land ? ((p.numTilesOwned() / land) * 100).toFixed(1) : "0"} %)`,
                      )}
                      ${this.stat(
                        translateText("staff_review.allies"),
                        p.allies().length
                          ? p
                              .allies()
                              .map((a) => a.displayName())
                              .join(", ")
                          : "—",
                      )}
                    </div>
                    <div class="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      ${UNITS.map((u) =>
                        this.stat(
                          translateText(u.key),
                          String(
                            p.structureCount(u.type) || p.units(u.type).length,
                          ),
                        ),
                      )}
                    </div>
                    <button
                      class="rounded-md border border-white/15 px-2 py-1 hover:border-white/50"
                      @click=${() => this.eventBus.emit(new GoToPlayerEvent(p))}
                    >
                      ${translateText("staff_review.go_to")}
                    </button>
                    ${live && p.isAlive()
                      ? html`<button
                          class="rounded-md border border-red-500/60 px-2 py-1 font-bold text-red-200 hover:bg-red-500/20"
                          @click=${() => this.kick(p)}
                        >
                          ${translateText("staff_review.kick")}
                        </button>`
                      : nothing}
                  `}
              ${live
                ? nothing
                : html`<button
                    class="rounded-md bg-red-500/80 px-2 py-1 font-bold hover:bg-red-500"
                    @click=${() => this.copyMoment()}
                  >
                    ${this.copied
                      ? translateText("staff_review.copied")
                      : translateText("staff_review.copy_link")}
                  </button>`}
              <label class="flex flex-col gap-1 text-xs text-white/60">
                ${translateText("staff_review.watch_other")}
                <select
                  class="rounded-md border border-white/15 bg-black/40 px-2 py-1 text-sm text-white"
                  @change=${(e: Event) =>
                    this.setFocus((e.target as HTMLSelectElement).value)}
                >
                  ${live && this.watchedID === null
                    ? html`<option value="" selected>—</option>`
                    : nothing}
                  ${humans.map(
                    (h) =>
                      html`<option
                        value=${h.clientID()!}
                        ?selected=${h.clientID() === this.watchedID}
                      >
                        ${h.displayName()}
                      </option>`,
                  )}
                </select>
              </label>
            </div>`}
      </div>
    `;
  }
}
