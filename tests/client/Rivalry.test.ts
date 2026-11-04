import { describe, expect, it } from "vitest";
import {
  findRivalPlayer,
  getRivalPresence,
  rivalOutcome,
  setRivalPresence,
} from "../../src/client/Rivalry";

const p = (name: string, clientID: string | null) => ({
  name: () => name,
  clientID: () => clientID,
});

const rival = {
  publicId: "pub",
  name: "Zorro",
  gamesTogether: 5,
  yourWins: 2,
  theirWins: 3,
};

describe("findRivalPlayer", () => {
  it("matches the rival's name ignoring case", () => {
    const players = [p("Alice", "a"), p("zorro", "z")];
    expect(findRivalPlayer(rival, players, "a")).toBe(players[1]);
  });

  it("matches the bare name of a discriminated account name", () => {
    const players = [p("Zorro", "z")];
    expect(findRivalPlayer({ name: "Zorro.1234" }, players, null)).toBe(
      players[0],
    );
  });

  it("returns null when absent, empty or when it is the player themself", () => {
    expect(findRivalPlayer(rival, [p("Alice", "a")], "a")).toBeNull();
    expect(findRivalPlayer(rival, [p("Zorro", "me")], "me")).toBeNull();
    expect(findRivalPlayer({ name: "  " }, [p("", "x")], null)).toBeNull();
  });
});

describe("rivalOutcome", () => {
  it("decides victory, defeat or nothing", () => {
    expect(rivalOutcome(true, false)).toBe("victory");
    expect(rivalOutcome(false, true)).toBe("defeat");
    expect(rivalOutcome(true, true)).toBeNull();
    expect(rivalOutcome(false, false)).toBeNull();
  });
});

describe("rival presence", () => {
  it("is kept per game", () => {
    setRivalPresence({ gameID: "g1", rival, clientID: "z" });
    expect(getRivalPresence("g1")?.clientID).toBe("z");
    expect(getRivalPresence("g2")).toBeNull();
    setRivalPresence(null);
    expect(getRivalPresence("g1")).toBeNull();
  });
});
