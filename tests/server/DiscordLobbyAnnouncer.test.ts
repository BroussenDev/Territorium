import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { GameMapType, GameMode } from "../../src/core/game/Game";
import {
  DiscordLobbyAnnouncer,
  EDIT_INTERVAL_MS,
  isWebhookUrl,
  lobbyMessage,
} from "../../src/server/DiscordLobbyAnnouncer";
import { InternalGameInfo } from "../../src/server/IPCBridgeSchema";

const WEBHOOK = "https://discord.com/api/webhooks/123/abc";
const SITE = "https://territorium.example";

function lobby(over: Partial<InternalGameInfo> = {}): InternalGameInfo {
  return {
    gameID: "ABCD1234",
    numClients: 1,
    publicGameType: "ffa",
    gameConfig: {
      gameMap: GameMapType.World,
      gameMode: GameMode.FFA,
      maxPlayers: 50,
    } as InternalGameInfo["gameConfig"],
    ...over,
  };
}

function setup() {
  const calls: { method: string; url: string; body: any }[] = [];
  let nextId = 1;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({
      method: String(init.method),
      url,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: `m${nextId++}` }),
    };
  }) as unknown as typeof fetch;
  let now = 0;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "discord-lobbies-"));
  const stateFile = path.join(dir, "discord-lobbies.json");
  const announcer = new DiscordLobbyAnnouncer(
    WEBHOOK,
    SITE,
    stateFile,
    fetchImpl,
    () => now,
  );
  const flush = () => new Promise((r) => setTimeout(r, 0));
  return {
    calls,
    announcer,
    stateFile,
    flush,
    advance: (ms: number) => (now += ms),
    fetchImpl,
  };
}

describe("DiscordLobbyAnnouncer", () => {
  it("links to the lobby and never pings anyone", () => {
    expect(isWebhookUrl(WEBHOOK)).toBe(true);
    expect(isWebhookUrl("https://evil.example/api/webhooks/1/a")).toBe(false);

    const embed = lobbyMessage(lobby({ numClients: 3, startsAt: 90_000 }), SITE)
      .embeds[0];
    expect(embed.url).toBe(`${SITE}/game/ABCD1234`);
    expect(embed.description).toContain("**3** joueurs dans le salon (sur 50)");
    expect(embed.description).toContain("<t:90:R>");
    expect(embed.fields.map((f) => f.value)).toEqual([
      "World",
      "Chacun pour soi",
    ]);
  });

  it("posts a lobby once its first player joins, then deletes it when it starts", async () => {
    const { calls, announcer, stateFile, flush } = setup();
    announcer.update([lobby({ numClients: 0 })]);
    await flush();
    expect(calls).toHaveLength(0);

    announcer.update([lobby()]);
    announcer.update([lobby()]);
    await flush();
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(`${WEBHOOK}?wait=true`);
    expect(calls[0].body.allowed_mentions).toEqual({ parse: [] });
    expect(JSON.parse(fs.readFileSync(stateFile, "utf8"))).toEqual(["m1"]);

    announcer.update([]);
    await flush();
    expect(calls[1]).toMatchObject({
      method: "DELETE",
      url: `${WEBHOOK}/messages/m1`,
    });
    expect(JSON.parse(fs.readFileSync(stateFile, "utf8"))).toEqual([]);
  });

  it("refreshes the player count at most every interval", async () => {
    const { calls, announcer, flush, advance } = setup();
    announcer.update([lobby()]);
    await flush();
    announcer.update([lobby({ numClients: 2 })]);
    expect(calls).toHaveLength(1);

    advance(EDIT_INTERVAL_MS);
    announcer.update([lobby({ numClients: 4 })]);
    announcer.update([lobby({ numClients: 4 })]);
    await flush();
    expect(calls).toHaveLength(2);
    expect(calls[1].method).toBe("PATCH");
    expect(calls[1].body.embeds[0].description).toContain("**4** joueurs");
  });

  it("deletes a lobby that closed while its post was on its way", async () => {
    const { calls, announcer, flush } = setup();
    announcer.update([lobby()]);
    announcer.update([]);
    await flush();
    await flush();
    expect(calls.map((c) => c.method)).toEqual(["POST", "DELETE"]);
  });

  it("deletes the posts a restart left behind", async () => {
    const { calls, stateFile, fetchImpl } = setup();
    fs.writeFileSync(stateFile, JSON.stringify(["old1", "old2"]));
    const next = new DiscordLobbyAnnouncer(WEBHOOK, SITE, stateFile, fetchImpl);
    await next.cleanUp();
    expect(calls.map((c) => c.url)).toEqual([
      `${WEBHOOK}/messages/old1`,
      `${WEBHOOK}/messages/old2`,
    ]);
    expect(JSON.parse(fs.readFileSync(stateFile, "utf8"))).toEqual([]);
  });
});
