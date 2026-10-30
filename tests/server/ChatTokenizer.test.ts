import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { normalize, tokenize } from "../../src/server/ChatTokenizer";

// The fixture was produced by running the account API's own normalize and
// tokenize over each input (tests/server/fixtures/chat-tokenizer.json). The
// port must match it exactly, or the model's weights stop lining up.
interface Case {
  input: string;
  normalized: string;
  tokens: string[];
}

const cases: Case[] = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "fixtures", "chat-tokenizer.json"),
    "utf8",
  ),
);

describe("chat tokenizer", () => {
  it("has a varied fixture", () => {
    expect(cases.length).toBeGreaterThanOrEqual(40);
  });

  it.each(cases.map((c) => [JSON.stringify(c.input), c] as const))(
    "matches the API on %s",
    (_label, c) => {
      expect(normalize(c.input)).toBe(c.normalized);
      expect(tokenize(c.input)).toEqual(c.tokens);
    },
  );

  it("reads evasions as the plain word", () => {
    expect(normalize("V.i.0.l")).toBe("viol");
    expect(normalize("FUUUCK")).toBe("fuuck");
    expect(normalize("séxe")).toBe("sexe");
    expect(normalize("100")).toBe("100");
  });
});
