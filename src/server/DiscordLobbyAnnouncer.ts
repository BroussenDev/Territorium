import fs from "fs";
import path from "path";
import { GameMode } from "../core/game/Game";
import { versusTeamSize } from "../core/game/Versus";
import { InternalGameInfo } from "./IPCBridgeSchema";
import { logger } from "./Logger";

const log = logger.child({ comp: "discord" });

// Posts each public lobby to the community Discord (DISCORD_WEBHOOK_URL) as
// soon as a first player is in it, with a link to join. The post follows the
// lobby: its player count and countdown are refreshed at most every
// EDIT_INTERVAL_MS, and it is deleted once the game starts or the lobby
// closes, so the channel only shows lobbies one can still join.

const WEBHOOK_RE =
  /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;
export const EDIT_INTERVAL_MS = 15_000;
const EMERALD = 0x10b981;

export const isWebhookUrl = (url: string | undefined): boolean =>
  WEBHOOK_RE.test(url ?? "");

// Map names and team labels go into Discord markdown.
const escapeMarkdown = (s: string) => s.replace(/([\\*_~`|>#[\]()-])/g, "\\$1");

function modeLabel(lobby: InternalGameInfo): string {
  const config = lobby.gameConfig;
  if (lobby.publicGameType === "nations" || config?.gameVariant === "nations") {
    return "Nations";
  }
  const versus = config ? versusTeamSize(config) : null;
  if (versus !== null) {
    return `Versus ${versus}v${versus}`;
  }
  if (config?.gameMode === GameMode.Team) {
    const teams = config.playerTeams;
    return teams === undefined
      ? "Équipes"
      : `Équipes (${escapeMarkdown(String(teams))})`;
  }
  return "Chacun pour soi";
}

/** The Discord message announcing `lobby`, joined through `siteUrl`. */
export function lobbyMessage(lobby: InternalGameInfo, siteUrl: string) {
  const url = `${siteUrl}/game/${encodeURIComponent(lobby.gameID)}`;
  const n = lobby.numClients;
  const max = lobby.gameConfig?.maxPlayers;
  const lines = [
    `**${n}** joueur${n > 1 ? "s" : ""} dans le salon${max ? ` (sur ${max})` : ""} : venez les rejoindre !`,
  ];
  if (lobby.startsAt !== undefined) {
    lines.push(`⏱️ Lancement <t:${Math.floor(lobby.startsAt / 1000)}:R>`);
  }
  lines.push(`[Rejoindre la partie](${url})`);
  return {
    embeds: [
      {
        title:
          lobby.publicGameType === "hosted"
            ? "🎮 Un joueur a ouvert un salon public"
            : "🎮 Une partie publique se remplit",
        url,
        description: lines.join("\n"),
        color: EMERALD,
        fields: [
          {
            name: "Carte",
            value: escapeMarkdown(String(lobby.gameConfig?.gameMap ?? "?")),
            inline: true,
          },
          { name: "Mode", value: modeLabel(lobby), inline: true },
        ],
      },
    ],
  };
}

type Post = {
  // Null while posting, and for good if the post failed.
  messageId: string | null;
  pending: boolean;
  // What the message shows that changes: player count and countdown.
  shown: string;
  editedAt: number;
  // The lobby closed while its message was still being posted.
  gone: boolean;
};

const shownState = (lobby: InternalGameInfo) =>
  `${lobby.numClients}:${lobby.startsAt ?? ""}`;

export class DiscordLobbyAnnouncer {
  private readonly posts = new Map<string, Post>();

  /**
   * `stateFile` keeps the ids of the messages still up, so those a restart
   * orphaned (their lobbies died with it) are deleted on the next start.
   */
  constructor(
    private readonly webhookUrl: string,
    private readonly siteUrl: string,
    private readonly stateFile: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  /** Deletes the messages a previous run left behind. */
  async cleanUp(): Promise<void> {
    let ids: string[];
    try {
      ids = JSON.parse(fs.readFileSync(this.stateFile, "utf8"));
    } catch {
      return;
    }
    await Promise.all(ids.map((id) => this.call("DELETE", id)));
    this.save();
  }

  /** Called with the lobbies this server lists, every broadcast. */
  update(lobbies: InternalGameInfo[]): void {
    const listed = new Set(lobbies.map((l) => l.gameID));
    for (const lobby of lobbies) {
      const post = this.posts.get(lobby.gameID);
      if (post === undefined) {
        if (lobby.numClients >= 1) void this.post(lobby);
      } else if (
        post.messageId !== null &&
        post.shown !== shownState(lobby) &&
        this.now() - post.editedAt >= EDIT_INTERVAL_MS
      ) {
        post.shown = shownState(lobby);
        post.editedAt = this.now();
        void this.call(
          "PATCH",
          post.messageId,
          lobbyMessage(lobby, this.siteUrl),
        );
      }
    }
    for (const [gameID, post] of this.posts) {
      if (listed.has(gameID)) continue;
      if (post.pending) {
        post.gone = true;
        continue;
      }
      this.posts.delete(gameID);
      if (post.messageId !== null) void this.remove(post.messageId);
    }
  }

  private async post(lobby: InternalGameInfo): Promise<void> {
    const post: Post = {
      messageId: null,
      pending: true,
      shown: shownState(lobby),
      editedAt: this.now(),
      gone: false,
    };
    this.posts.set(lobby.gameID, post);
    const res = await this.call(
      "POST",
      null,
      lobbyMessage(lobby, this.siteUrl),
    );
    post.pending = false;
    const id = (res as { id?: unknown } | null)?.id;
    // A failed post is not retried: the lobby stays unannounced.
    if (typeof id === "string") post.messageId = id;
    if (post.gone) {
      this.posts.delete(lobby.gameID);
      if (post.messageId !== null) await this.remove(post.messageId);
    } else if (post.messageId !== null) {
      this.save();
    }
  }

  private async remove(messageId: string): Promise<void> {
    this.save();
    await this.call("DELETE", messageId);
  }

  private save(): void {
    const ids = [...this.posts.values()]
      .map((p) => p.messageId)
      .filter((id): id is string => id !== null);
    try {
      fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
      fs.writeFileSync(this.stateFile, JSON.stringify(ids));
    } catch (e) {
      log.warn(`could not save announced lobbies: ${String(e)}`);
    }
  }

  // Fire and forget: a failed call is logged, never retried. Returns the
  // posted message for a POST, null otherwise or on failure.
  private async call(
    method: "POST" | "PATCH" | "DELETE",
    messageId: string | null,
    message?: object,
  ): Promise<unknown> {
    const url =
      messageId === null
        ? `${this.webhookUrl}?wait=true`
        : `${this.webhookUrl}/messages/${messageId}`;
    try {
      const res = await this.fetchImpl(url, {
        method,
        headers: { "Content-Type": "application/json" },
        // Nothing in a lobby post may ping anyone.
        body:
          message === undefined
            ? undefined
            : JSON.stringify({
                username: "Territorium",
                allowed_mentions: { parse: [] },
                ...message,
              }),
        signal: AbortSignal.timeout(10_000),
      });
      // A message someone already deleted by hand is gone either way.
      if (!res.ok && !(method === "DELETE" && res.status === 404)) {
        log.warn(`lobby announcement ${method} refused (${res.status})`);
        return null;
      }
      return method === "POST" ? await res.json() : null;
    } catch (e) {
      log.warn(`lobby announcement ${method} failed: ${String(e)}`);
      return null;
    }
  }
}
