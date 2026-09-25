import { describe, expect, it } from "vitest";
import { ChallengesResponseSchema } from "../src/core/ApiSchemas";

// The solo challenge's config exactly as the API draws it.
const soloConfig = {
  gameMap: "Black Sea",
  gameMapSize: "Compact",
  gameType: "Singleplayer",
  gameMode: "Free For All",
  difficulty: "Hard",
  bots: 100,
  nations: "default",
  donateGold: false,
  donateTroops: false,
  infiniteGold: false,
  infiniteTroops: false,
  instantBuild: false,
  randomSpawn: true,
  seed: "D2026-09-25-0a1b2c3d",
};

const response = {
  challenges: [
    {
      id: "D2026-09-25:0",
      period: "daily",
      endsAt: "2026-09-26T00:00:00.000Z",
      medals: 40,
      kind: "solo",
      config: soloConfig,
      placeMedals: [300, 200, 150, 75, 75, 75, 75, 75, 75, 75],
      board: [{ rank: 1, publicId: "abc", username: "Racer", ticks: 4210 }],
      players: 1,
      mine: { bestTicks: 4210, checking: false, rejected: false, rank: 1 },
    },
    {
      id: "W2026-09-21:1",
      period: "weekly",
      endsAt: "2026-09-28T00:00:00.000Z",
      medals: 150,
      kind: "multi",
      template: "build_city",
      mode: "ffa",
      scope: "game",
      target: 12,
      progress: 5,
      completed: false,
    },
  ],
  lastSolo: {
    id: "D2026-09-24:0",
    config: { ...soloConfig, gameMap: "Japan", seed: "D2026-09-24-00000000" },
    settled: true,
    board: [{ rank: 1, publicId: "def", username: null, ticks: 3900 }],
  },
};

describe("ChallengesResponseSchema", () => {
  it("parses the API's challenge list, the solo config included", () => {
    const parsed = ChallengesResponseSchema.parse(response);
    const solo = parsed.challenges[0];
    expect(solo.kind).toBe("solo");
    if (solo.kind === "solo") {
      expect(solo.config.seed).toBe("D2026-09-25-0a1b2c3d");
      expect(solo.config.bots).toBe(100);
    }
    expect(parsed.lastSolo?.board[0].username).toBeNull();
  });

  it("keeps a template the client doesn't know yet", () => {
    const next = structuredClone(response);
    next.challenges[1].template = "future_template";
    expect(ChallengesResponseSchema.safeParse(next).success).toBe(true);
  });

  it("accepts a guest's list and no previous solo race", () => {
    const guest = structuredClone(response);
    (guest.challenges[0] as { mine: unknown }).mine = null;
    expect(
      ChallengesResponseSchema.safeParse({ ...guest, lastSolo: null }).success,
    ).toBe(true);
  });
});
