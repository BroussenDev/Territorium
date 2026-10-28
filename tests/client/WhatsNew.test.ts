import { describe, expect, it } from "vitest";
import { WHATS_NEW_ID, whatsNewDecision } from "../../src/client/WhatsNew";

describe("WhatsNew", () => {
  it("shows the notes once after an update, never to a newcomer", () => {
    expect(whatsNewDecision(null)).toEqual({ show: false, mark: WHATS_NEW_ID });
    expect(whatsNewDecision("v0_1_100").show).toBe(true);
    expect(whatsNewDecision(WHATS_NEW_ID).show).toBe(false);
  });
});
