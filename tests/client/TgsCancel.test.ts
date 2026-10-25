import { describe, expect, it } from "vitest";
import { parseTgsCancel } from "../../src/client/TgsCancelModal";

describe("parseTgsCancel", () => {
  it("reads what the game server sends", () => {
    const detail = parseTgsCancel(
      JSON.stringify({
        code: "TGS-105",
        cheaters: [{ clientID: "AAAAAAAA", username: "Bot" }],
        compensation: 100,
        penalty: 50,
        banDays: 7,
      }),
    );
    expect(detail?.code).toBe("TGS-105");
    expect(detail?.cheaters[0].username).toBe("Bot");
  });

  it("ignores anything malformed", () => {
    expect(parseTgsCancel(undefined)).toBeNull();
    expect(parseTgsCancel("not json")).toBeNull();
    expect(parseTgsCancel(JSON.stringify({ code: "TGS-105" }))).toBeNull();
  });
});
