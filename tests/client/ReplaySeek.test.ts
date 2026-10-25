import { describe, expect, it } from "vitest";
import { replaySeekTurn } from "../../src/client/ReplaySeek";
import { versionedReplayUrl } from "../../src/client/VersionedReplay";

describe("replaySeekTurn", () => {
  it("reads the turn a clip starts at", () => {
    expect(replaySeekTurn("?at=1234")).toBe(1234);
    expect(replaySeekTurn("?foo=1&at=50")).toBe(50);
  });

  it("ignores a missing, zero or malformed turn", () => {
    expect(replaySeekTurn("")).toBeNull();
    expect(replaySeekTurn("?at=0")).toBeNull();
    expect(replaySeekTurn("?at=-3")).toBeNull();
    expect(replaySeekTurn("?at=12abc")).toBeNull();
    expect(replaySeekTurn("?at=99999999999")).toBeNull();
  });

  it("carries the moment to another build's replay shell", () => {
    expect(versionedReplayUrl("territorium.gg", "abcd1234", 1800)).toBe(
      "https://replay.territorium.gg/abcd1234?at=1800",
    );
    expect(versionedReplayUrl("territorium.gg", "abcd1234", null)).toBe(
      "https://replay.territorium.gg/abcd1234",
    );
  });
});
