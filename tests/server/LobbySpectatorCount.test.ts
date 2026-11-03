import { describe, expect, test } from "vitest";
import { countLobbyPlayers } from "../../src/server/WorkerLobbyService";

describe("countLobbyPlayers", () => {
  test("does not count spectators toward the lobby headcount", () => {
    expect(
      countLobbyPlayers([
        { spectator: false },
        { spectator: true },
        { spectator: undefined },
        { spectator: true },
      ]),
    ).toBe(2);
  });

  test("is zero for an empty or missing client list", () => {
    expect(countLobbyPlayers([])).toBe(0);
    expect(countLobbyPlayers(undefined)).toBe(0);
  });
});
