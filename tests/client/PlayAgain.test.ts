import { beforeEach, describe, expect, it } from "vitest";
import {
  consumePlayAgain,
  joinedPublicType,
  rememberPublicJoin,
  requestPlayAgain,
} from "../../src/client/PlayAgain";

describe("PlayAgain", () => {
  beforeEach(() => sessionStorage.clear());

  it("remembers which lobby list a game was joined from", () => {
    rememberPublicJoin("abc123", "team");
    expect(joinedPublicType("abc123")).toBe("team");
    // Another game: nothing to replay from.
    expect(joinedPublicType("zzz999")).toBeNull();
  });

  it("never offers to replay a hosted lobby", () => {
    rememberPublicJoin("abc123", "hosted");
    expect(joinedPublicType("abc123")).toBeNull();
  });

  it("hands the pending request over once", () => {
    requestPlayAgain("ffa");
    expect(consumePlayAgain()).toBe("ffa");
    expect(consumePlayAgain()).toBeNull();
    requestPlayAgain("solo");
    expect(consumePlayAgain()).toBe("solo");
  });

  it("ignores a stored value it doesn't know", () => {
    sessionStorage.setItem("territorium.playAgain", "nonsense");
    expect(consumePlayAgain()).toBeNull();
  });
});
