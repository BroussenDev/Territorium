import { describe, expect, it } from "vitest";
import { hashParam } from "../../src/client/Utils";

describe("hashParam", () => {
  it("reads the account API's returns, written #key=value", () => {
    expect(hashParam("#two-factor=abc_DEF-123", "two-factor")).toBe(
      "abc_DEF-123",
    );
    expect(
      hashParam("#step-up=tok&step-up-action=delete", "step-up-action"),
    ).toBe("delete");
    expect(hashParam("#revoke-sessions=xyz", "revoke-sessions")).toBe("xyz");
  });

  it("reads sign-in links, written #section?key=value", () => {
    expect(hashParam("#token-login?token-login=T0K", "token-login")).toBe(
      "T0K",
    );
  });

  it("is null when the key is missing or empty", () => {
    expect(hashParam("#two-factor", "two-factor")).toBeNull();
    expect(hashParam("", "two-factor")).toBeNull();
  });
});
