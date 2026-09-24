import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/client/Api", () => ({
  updateUsername: vi.fn(async () => ({ ok: true, data: {} })),
}));

import {
  claimAccountNameIfMissing,
  resetAccountNameClaimForTests,
} from "../../src/client/AccountNameClaim";
import { updateUsername } from "../../src/client/Api";
import type { UserMeResponse } from "../../src/core/ApiSchemas";

const updateMock = vi.mocked(updateUsername);

function me(opts: { email?: string; username?: string | null }) {
  return {
    user: opts.email ? { email: opts.email } : {},
    player: { publicId: "adw8v0bdjl", username: opts.username ?? null },
  } as unknown as UserMeResponse;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAccountNameClaimForTests();
});

describe("claimAccountNameIfMissing", () => {
  it("gives a signed-in account without a username the name it plays under", async () => {
    const claimed = await claimAccountNameIfMissing(
      me({ email: "a@b.fr" }),
      " broussen ",
    );
    expect(claimed).toBe(true);
    expect(updateMock).toHaveBeenCalledWith("broussen");
  });

  it("only tries once per page load", async () => {
    await claimAccountNameIfMissing(me({ email: "a@b.fr" }), "broussen");
    await claimAccountNameIfMissing(me({ email: "a@b.fr" }), "broussen");
    expect(updateMock).toHaveBeenCalledOnce();
  });

  it("leaves an account that already has a username alone", async () => {
    await claimAccountNameIfMissing(
      me({ email: "a@b.fr", username: "autre" }),
      "broussen",
    );
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("skips guests, signed-out players and names the account rules refuse", async () => {
    await claimAccountNameIfMissing(me({}), "broussen");
    await claimAccountNameIfMissing(false, "broussen");
    await claimAccountNameIfMissing(me({ email: "a@b.fr" }), "a b!");
    await claimAccountNameIfMissing(me({ email: "a@b.fr" }), null);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
