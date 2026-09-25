import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/client/Api", () => ({
  fetchPublicPlayerGames: vi.fn(),
}));

vi.mock("../../src/client/Utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/client/Utils")>()),
  translateText: vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
  ),
}));

import { fetchPublicPlayerGames } from "../../src/client/Api";
import "../../src/client/components/baseComponents/stats/PlayerGameHistoryView";
import type { PlayerGameHistoryView } from "../../src/client/components/baseComponents/stats/PlayerGameHistoryView";

describe("PlayerGameHistoryView history window", () => {
  let el: PlayerGameHistoryView | undefined;

  const show = async (historyDays?: number) => {
    vi.mocked(fetchPublicPlayerGames).mockResolvedValueOnce({
      results: [],
      nextCursor: null,
      historyDays,
    });
    el = document.createElement(
      "player-game-history-view",
    ) as PlayerGameHistoryView;
    el.publicId = "aB3xK9zQ";
    document.body.appendChild(el);
    await vi.waitFor(() =>
      expect(fetchPublicPlayerGames).toHaveBeenCalledOnce(),
    );
    await el.updateComplete;
    return el;
  };

  afterEach(() => {
    el?.remove();
    el = undefined;
    vi.clearAllMocks();
  });

  it("says how many days of games the player keeps", async () => {
    const view = await show(365);
    await vi.waitFor(() =>
      expect(
        view.querySelector("[data-history-window]")?.textContent?.trim(),
      ).toBe('account_modal.games_history_window {"days":365}'),
    );
  });

  it("says nothing when the API doesn't tell", async () => {
    const view = await show(undefined);
    expect(view.querySelector("[data-history-window]")).toBeNull();
  });
});
