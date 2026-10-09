import { describe, expect, it } from "vitest";
import {
  acceptsNewGames,
  CLOSABLE_GAMES,
  closableOfLobby,
  inMaintenance,
  maintenanceAhead,
  OPEN_SERVER_STATUS,
  ServerStatusSchema,
} from "../src/core/ServerStatus";

describe("server status", () => {
  it("accepts every game when nothing is closed", () => {
    for (const game of CLOSABLE_GAMES) {
      expect(acceptsNewGames(OPEN_SERVER_STATUS, game, 0)).toBe(true);
    }
  });

  it("refuses only the closed kinds", () => {
    const status = { closed: ["survival" as const], maintenance: null };
    expect(acceptsNewGames(status, "survival", 0)).toBe(false);
    expect(acceptsNewGames(status, "ffa", 0)).toBe(true);
  });

  it("announces a maintenance, then refuses every game once it begins", () => {
    const status = { closed: [], maintenance: { startsAt: 1_000 } };
    expect(maintenanceAhead(status, 999)).toBe(true);
    expect(inMaintenance(status, 999)).toBe(false);
    expect(acceptsNewGames(status, "solo", 999)).toBe(true);
    expect(maintenanceAhead(status, 1_000)).toBe(false);
    expect(inMaintenance(status, 1_000)).toBe(true);
    for (const game of CLOSABLE_GAMES) {
      expect(acceptsNewGames(status, game, 1_000)).toBe(false);
    }
  });

  it("lets staff test during a maintenance that allows it", () => {
    const strict = { closed: [], maintenance: { startsAt: 0 } };
    expect(acceptsNewGames(strict, "private", 1, "admin")).toBe(false);
    const testing = {
      closed: ["survival" as const],
      maintenance: { startsAt: 0, staffCanPlay: true },
    };
    for (const role of ["root", "admin", "mod"]) {
      expect(acceptsNewGames(testing, "private", 1, role)).toBe(true);
    }
    expect(acceptsNewGames(testing, "private", 1, null)).toBe(false);
    expect(acceptsNewGames(testing, "private", 1, "banned")).toBe(false);
    // A closed mode stays closed, staff included.
    expect(acceptsNewGames(testing, "survival", 1, "admin")).toBe(false);
  });

  it("counts listed private lobbies as private games", () => {
    expect(closableOfLobby("hosted")).toBe("private");
    expect(closableOfLobby("conquest")).toBe("conquest");
  });

  it("rejects unknown kinds", () => {
    expect(
      ServerStatusSchema.safeParse({ closed: ["chess"], maintenance: null })
        .success,
    ).toBe(false);
  });
});
