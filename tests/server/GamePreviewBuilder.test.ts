import { describe, expect, it } from "vitest";
import { buildPreview } from "../../src/server/GamePreviewBuilder";

const finished = (winner: string[], config: Record<string, unknown> = {}) => ({
  info: {
    config: {
      gameMap: "Giant World Map",
      gameMode: "Free For All",
      gameType: "Public",
      ...config,
    },
    players: [
      {
        clientID: "aaaaaaaa",
        username: "Docmation",
        clanTag: null,
        stats: { a: 1 },
      },
      {
        clientID: "bbbbbbbb",
        username: "Broussen",
        clanTag: null,
        stats: { a: 1 },
      },
    ],
    winner,
    duration: 1618,
    start: Date.UTC(2026, 8, 27, 21, 37),
    end: Date.UTC(2026, 8, 27, 22, 4),
  },
});

const preview = (info: ReturnType<typeof finished>) =>
  buildPreview("amDoEPS2Dz", "https://example.com", "w1", null, info);

describe("game link previews", () => {
  it("names the winner of a finished game's replay", async () => {
    const meta = await preview(finished(["player", "aaaaaaaa"]));
    expect(meta.title).toBe("Territorium replay: Docmation won");
    expect(meta.description.split("\n")).toEqual([
      "Free For All on Giant World Map (Public)",
      "2 players • 26m 58s • Sep 27, 2026 • 21:37 UTC",
    ]);
    expect(meta.joinUrl).toBe("https://example.com/w1/game/amDoEPS2Dz");
  });

  it("shows a Nations game won by the AI", async () => {
    const meta = await preview(
      finished(["nation", "France"], { gameVariant: "nations" }),
    );
    expect(meta.title).toBe("Territorium replay: France (AI) won");
    expect(meta.description).toMatch(/^Nations on Giant World Map/);
  });

  it("still describes a replay without a winner", async () => {
    const meta = await preview(finished([]));
    expect(meta.title).toBe("Territorium replay");
  });
});
