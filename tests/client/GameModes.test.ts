import { beforeEach, describe, expect, it } from "vitest";
import {
  favoriteModes,
  modeLobby,
  modePlays,
  modeWaiting,
  pinnedModes,
  recordModePlay,
  togglePinnedMode,
} from "../../src/client/GameModes";
import type { PublicGames } from "../../src/core/Schemas";

const lobby = (numClients: number) => ({ gameID: "g", numClients }) as never;

function lobbies(counts: Record<string, number>): PublicGames {
  return {
    serverTime: 0,
    games: Object.fromEntries(
      Object.entries(counts).map(([k, n]) => [k, [lobby(n)]]),
    ),
  } as unknown as PublicGames;
}

beforeEach(() => localStorage.clear());

describe("game mode favourites", () => {
  it("picks the busiest modes for a new player", () => {
    const l = lobbies({ nations: 3, conquest: 9, survival: 5 });
    expect(favoriteModes(l)).toEqual(["conquest", "survival"]);
    // Before any lobby, in the page's order.
    expect(favoriteModes(null)).toEqual(["nations", "versus"]);
  });

  it("prefers the modes the player joins the most", () => {
    recordModePlay("survival");
    recordModePlay("survival");
    recordModePlay("nations");
    expect(modePlays()).toEqual({ survival: 2, nations: 1 });
    const l = lobbies({ conquest: 30 });
    expect(favoriteModes(l)).toEqual(["survival", "nations"]);
  });

  it("puts pinned modes first, two at most", () => {
    recordModePlay("conquest");
    expect(togglePinnedMode("survival")).toBe(true);
    expect(favoriteModes(null)).toEqual(["survival", "conquest"]);
    expect(togglePinnedMode("nations")).toBe(true);
    expect(togglePinnedMode("conquest")).toBe(false);
    expect(pinnedModes()).toEqual(["survival", "nations"]);
    expect(favoriteModes(null)).toEqual(["survival", "nations"]);
    // Pinning again unpins.
    expect(togglePinnedMode("survival")).toBe(true);
    expect(pinnedModes()).toEqual(["nations"]);
  });

  it("leaves a locked mode out unless the player chose it", () => {
    const l = lobbies({ "1v1": 50, conquest: 1, nations: 2 });
    expect(favoriteModes(l, ["versus"])).toEqual(["nations", "conquest"]);
    togglePinnedMode("versus");
    expect(favoriteModes(l, ["versus"])).toEqual(["versus", "nations"]);
  });

  it("reads Versus across its formats", () => {
    const l = lobbies({ "1v1": 2, "2v2": 5, "4v4": 1 });
    expect(modeWaiting(l, "versus")).toBe(8);
    expect(modeLobby(l, "versus")?.numClients).toBe(5);
    expect(modeLobby(l, "nations")).toBeUndefined();
  });

  it("ignores broken storage", () => {
    localStorage.setItem("territorium.modePins", "{not json");
    localStorage.setItem(
      "territorium.modePlays",
      JSON.stringify({ nations: "x", bogus: 4 }),
    );
    expect(pinnedModes()).toEqual([]);
    expect(modePlays()).toEqual({});
  });
});
