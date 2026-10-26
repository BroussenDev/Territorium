import { describe, expect, it } from "vitest";
import { reviewFocus } from "../../src/client/hud/layers/StaffReviewPanel";
import { replayUrlAt } from "../../src/client/ReplaySeek";

describe("replay timeline", () => {
  it("replays from a turn, keeping the review's other parameters", () => {
    expect(
      replayUrlAt("https://territorium.gg/game/AbC?focus=p1&at=900", 300),
    ).toBe("https://territorium.gg/game/AbC?focus=p1&at=300");
    expect(replayUrlAt("https://territorium.gg/game/AbC?at=900", 0)).toBe(
      "https://territorium.gg/game/AbC",
    );
  });

  it("reads the reviewed player from ?focus=, and nothing unsafe", () => {
    expect(reviewFocus("?at=10&focus=Ab12_cd")).toBe("Ab12_cd");
    expect(reviewFocus("?focus=<script>")).toBeNull();
    expect(reviewFocus("?at=10")).toBeNull();
  });
});
