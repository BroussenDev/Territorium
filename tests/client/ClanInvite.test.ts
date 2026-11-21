import {
  clanInviteUrl,
  clearPendingInvite,
  markPendingInviteForResume,
  parseClanInvitePath,
  peekPendingInvite,
  pendingInviteToResume,
  rememberPendingInvite,
  resumeInviteAfterSignIn,
} from "../../src/client/ClanInvite";

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size;
    },
  } as Storage;
}

describe("parseClanInvitePath", () => {
  it("accepts the French and English forms, with or without a slash", () => {
    expect(parseClanInvitePath("/clan/frx/rejoindre")).toBe("FRX");
    expect(parseClanInvitePath("/clan/FRX/join")).toBe("FRX");
    expect(parseClanInvitePath("/clan/A1/join/")).toBe("A1");
  });

  it("rejects anything else", () => {
    for (const p of [
      "/",
      "/clan/FRX",
      "/clan/F/join",
      "/clan/TOOLONG/join",
      "/clan/FR-X/join",
      "/clan/FRX/join/extra",
      "/joueur/abc",
      "/clans/FRX/join",
    ]) {
      expect(parseClanInvitePath(p)).toBeNull();
    }
  });
});

describe("clanInviteUrl", () => {
  it("uses rejoindre for French and join otherwise", () => {
    expect(clanInviteUrl("frx", "fr")).toMatch(/\/clan\/FRX\/rejoindre$/);
    expect(clanInviteUrl("FRX", "en")).toMatch(/\/clan\/FRX\/join$/);
    expect(clanInviteUrl("FRX", "de-CH")).toMatch(/\/clan\/FRX\/join$/);
  });

  it("refuses an invalid tag", () => {
    expect(clanInviteUrl("a b", "en")).toBeNull();
    expect(clanInviteUrl("", "en")).toBeNull();
  });

  it("round-trips through the parser", () => {
    const url = new URL(clanInviteUrl("ABC", "fr")!);
    expect(parseClanInvitePath(url.pathname)).toBe("ABC");
  });
});

describe("pending invite", () => {
  it("is kept, expires after a day, and can be cleared", () => {
    const s = memoryStorage();
    rememberPendingInvite("frx", 1000, s);
    expect(peekPendingInvite(1000, s)).toBe("FRX");
    expect(peekPendingInvite(1000 + 25 * 3600 * 1000, s)).toBeNull();
    rememberPendingInvite("frx", 1000, s);
    clearPendingInvite(s);
    expect(peekPendingInvite(1000, s)).toBeNull();
  });

  it("ignores garbage in storage", () => {
    const s = memoryStorage();
    s.setItem("territorium.pendingClanInvite", "{not json");
    expect(peekPendingInvite(0, s)).toBeNull();
    s.setItem(
      "territorium.pendingClanInvite",
      JSON.stringify({ tag: "<x>", at: 0 }),
    );
    expect(peekPendingInvite(0, s)).toBeNull();
  });

  it("only resumes once flagged", () => {
    const s = memoryStorage();
    rememberPendingInvite("FRX", 5, s);
    expect(pendingInviteToResume(5, s)).toBeNull();
    markPendingInviteForResume(5, s);
    expect(pendingInviteToResume(5, s)).toBe("FRX");
  });
});

describe("resumeInviteAfterSignIn", () => {
  it("flags while signed out, then joins once after sign-in", async () => {
    const s = memoryStorage();
    const join = vi.fn().mockResolvedValue({ status: "requested" });
    rememberPendingInvite("FRX", 10, s);

    expect(await resumeInviteAfterSignIn(false, join, 10, s)).toBeNull();
    expect(join).not.toHaveBeenCalled();

    const done = await resumeInviteAfterSignIn(true, join, 11, s);
    expect(done).toEqual({ tag: "FRX", result: { status: "requested" } });
    expect(join).toHaveBeenCalledWith("FRX", "invite");

    expect(await resumeInviteAfterSignIn(true, join, 12, s)).toBeNull();
    expect(join).toHaveBeenCalledTimes(1);
  });

  it("does not join for a player who was already signed in", async () => {
    const s = memoryStorage();
    const join = vi.fn();
    rememberPendingInvite("FRX", 10, s);
    expect(await resumeInviteAfterSignIn(true, join, 10, s)).toBeNull();
    expect(join).not.toHaveBeenCalled();
    expect(peekPendingInvite(10, s)).toBe("FRX");
  });

  it("passes join errors (banned, unknown clan) back to the caller", async () => {
    const s = memoryStorage();
    const join = vi
      .fn()
      .mockResolvedValue({ error: "clan_modal.error_banned" });
    rememberPendingInvite("FRX", 10, s);
    markPendingInviteForResume(10, s);
    const done = await resumeInviteAfterSignIn(true, join, 10, s);
    expect(done?.result).toEqual({ error: "clan_modal.error_banned" });
  });
});
