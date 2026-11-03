import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/client/Auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/client/Auth")>()),
  getAuthHeader: vi.fn(async () => "Bearer test"),
}));

vi.mock("../../src/client/ApiBase", () => ({
  getApiBase: () => "https://api.test",
}));

import { pollRankedQueue } from "../../src/client/Api";

const QUEUED = {
  count: 3,
  min: 8,
  max: 16,
  lowMin: 4,
  startsIn: null,
  lowIn: 180,
};

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("pollRankedQueue", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns the queue state on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(200, QUEUED)),
    );
    expect(await pollRankedQueue()).toEqual(QUEUED);
  });

  it("reports a player who has not finished a normal game", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(403, { error: "ranked_needs_normal_game" })),
    );
    expect(await pollRankedQueue()).toBe("needs_normal_game");
  });

  it("reports a refused login or ban as login_required", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(401, {})),
    );
    expect(await pollRankedQueue()).toBe("login_required");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(403, { error: "banned" })),
    );
    expect(await pollRankedQueue()).toBe("login_required");
  });

  it("treats a 403 without a JSON body as login_required", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("forbidden", { status: 403 })),
    );
    expect(await pollRankedQueue()).toBe("login_required");
  });

  it("returns false on other failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(500, {})),
    );
    expect(await pollRankedQueue()).toBe(false);
  });
});
