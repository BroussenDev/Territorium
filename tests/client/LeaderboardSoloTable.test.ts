import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/client/Api", () => ({
  fetchSoloLeaderboard: vi.fn(async () => false),
}));

vi.mock("../../src/client/Utils", () => ({
  translateText: vi.fn((key: string) => key),
}));

import { fetchSoloLeaderboard } from "../../src/client/Api";
import "../../src/client/components/leaderboard/LeaderboardSoloTable";
import type { LeaderboardSoloTable } from "../../src/client/components/leaderboard/LeaderboardSoloTable";

describe("LeaderboardSoloTable", () => {
  let el: LeaderboardSoloTable;

  const render = async (
    result: Awaited<ReturnType<typeof fetchSoloLeaderboard>>,
  ) => {
    vi.mocked(fetchSoloLeaderboard).mockResolvedValueOnce(result);
    el = document.createElement(
      "leaderboard-solo-table",
    ) as LeaderboardSoloTable;
    document.body.appendChild(el);
    await el.ensureLoaded();
    await el.updateComplete;
  };

  afterEach(() => {
    el?.remove();
  });

  it("lists players by rank with their wins, games and points", async () => {
    await render({
      players: [
        {
          rank: 1,
          publicId: "aB3xK9zQ",
          username: "Alice",
          points: 12,
          wins: 4,
          games: 9,
        },
        {
          rank: 2,
          publicId: "zZ9yY8xX",
          username: null,
          points: 3,
          wins: 3,
          games: 3,
        },
      ],
    });
    const rows = Array.from(el.querySelectorAll("tbody tr"));
    expect(rows).toHaveLength(2);
    const cells = Array.from(rows[0].querySelectorAll("td")).map((td) =>
      td.textContent?.trim(),
    );
    expect(cells.slice(2)).toEqual(["4", "9", "12"]);
    expect(el.textContent).toContain("leaderboard_modal.solo_rules");
  });

  it("explains how to get on an empty board", async () => {
    await render({ players: [] });
    expect(el.textContent).toContain("leaderboard_modal.solo_no_stats");
    expect(el.textContent).toContain("leaderboard_modal.solo_rules");
  });

  it("offers a retry when the board fails to load", async () => {
    await render(false);
    expect(el.textContent).toContain("leaderboard_modal.error");
    expect(el.querySelector("button")?.textContent).toContain(
      "leaderboard_modal.try_again",
    );
  });
});
