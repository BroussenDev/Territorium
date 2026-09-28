import { describe, expect, it } from "vitest";
import {
  calmShouting,
  ChatModerator,
  collapseRuns,
  hasLink,
  isHateSpeech,
} from "../../src/server/ChatModeration";
import { cid } from "../util/GameServerHarness";

const ALICE = cid("alice");
const BOB = cid("bob");

describe("ChatModerator", () => {
  it("lets ordinary lines through untouched", () => {
    const mod = new ChatModerator();
    for (const [i, line] of [
      "gg well played",
      "con los aliados",
      "spicy strategy",
      "négociation ?",
      "je suis crevé",
      "classic dickens",
      "à pute... non",
    ].entries()) {
      const verdict = mod.moderate(ALICE, line, i * 5_000);
      if (line === "à pute... non") {
        expect(verdict.text).toBe("à ****... non");
      } else {
        expect(verdict).toEqual({ text: line, notice: null });
      }
    }
  });

  it("masks insults, even disguised, and warns their sender", () => {
    const mod = new ChatModerator();
    expect(mod.moderate(ALICE, "t'es un C0NN.A.RD", 0)).toEqual({
      text: "t'es un *********",
      notice: "warned",
    });
    expect(mod.moderate(BOB, "fuuuuck you", 0)).toEqual({
      text: "******* ***",
      notice: "warned",
    });
  });

  it("masks swearing without a strike", () => {
    const mod = new ChatModerator();
    for (let i = 0; i < 5; i++) {
      expect(mod.moderate(ALICE, `putain ${i}`, i * 5_000)).toEqual({
        text: `****** ${i}`,
        notice: null,
      });
    }
  });

  it("blocks hate speech", () => {
    const mod = new ChatModerator();
    expect(mod.moderate(ALICE, "sale arabe", 0)).toEqual({
      text: null,
      notice: "blocked",
    });
    expect(isHateSpeech("nazi")).toBe(true);
    expect(isHateSpeech("a nice game")).toBe(false);
  });

  it("mutes after three strikes, longer each time", () => {
    const mod = new ChatModerator();
    mod.moderate(ALICE, "connard", 0);
    mod.moderate(ALICE, "salope", 1_000);
    expect(mod.moderate(ALICE, "abruti", 2_000)).toEqual({
      text: "******",
      notice: "muted",
      seconds: 120,
    });
    expect(mod.moderate(ALICE, "sorry", 62_000)).toEqual({
      text: null,
      notice: "muted",
      seconds: 60,
    });
    expect(mod.moderate(ALICE, "sorry", 122_000).text).toBe("sorry");

    // Hate is two strikes: one more insult earns the second, longer mute.
    expect(mod.moderate(ALICE, "sale noir", 130_000).notice).toBe("blocked");
    expect(mod.moderate(ALICE, "bitch", 140_000)).toEqual({
      text: "*****",
      notice: "muted",
      seconds: 300,
    });
    // Others are not affected.
    expect(mod.moderate(BOB, "hi", 141_000).text).toBe("hi");
  });

  it("blocks links", () => {
    const mod = new ChatModerator();
    for (const line of [
      "join discord.gg/abc",
      "https://example.org",
      "go to www.site",
      "free-gold.xyz now",
    ]) {
      expect(mod.moderate(ALICE, line, 0)).toEqual({
        text: null,
        notice: "link",
      });
    }
    expect(hasLink("gg. next game")).toBe(false);
    expect(hasLink("1.5 troops")).toBe(false);
  });

  it("blocks a line repeated within 30 seconds", () => {
    const mod = new ChatModerator();
    expect(mod.moderate(ALICE, "help me", 0).text).toBe("help me");
    expect(mod.moderate(ALICE, "HELP  me", 10_000)).toEqual({
      text: null,
      notice: "repeated",
    });
    expect(mod.moderate(BOB, "help me", 10_000).text).toBe("help me");
    expect(mod.moderate(ALICE, "help me", 45_000).text).toBe("help me");
  });

  it("calms shouting and long runs of one character", () => {
    const mod = new ChatModerator();
    expect(mod.moderate(ALICE, "NOOOOOOOOON", 0).text).toBe("NOOOON");
    expect(mod.moderate(ALICE, "ATTACK THE NORTH NOW", 5_000).text).toBe(
      "attack the north now",
    );
    expect(collapseRuns("!!!!!!!! gg")).toBe("!!!! gg");
    expect(calmShouting("GG WP")).toBe("GG WP");
    expect(calmShouting("OK je Viens")).toBe("OK je Viens");
  });
});
