import { describe, expect, it } from "vitest";
import {
  crestOf,
  defaultCrest,
  formatCrest,
  parseCrest,
} from "../src/core/ClanCrest";

describe("ClanCrest", () => {
  it("parses a stored crest and formats it back", () => {
    const crest = parseCrest("banner:navy:gold:crown");
    expect(crest).toEqual({
      shape: "banner",
      field: "navy",
      charge: "gold",
      symbol: "crown",
    });
    expect(formatCrest(crest!)).toBe("banner:navy:gold:crown");
  });

  it("rejects unknown parts and a charge the color of its field", () => {
    for (const bad of [
      null,
      "",
      "banner:navy:navy:crown",
      "blob:navy:gold:crown",
      "banner:navy:gold:skull",
      "banner:navy:gold:crown:extra",
    ]) {
      expect(parseCrest(bad)).toBeNull();
    }
  });

  it("gives every clan a stable default from its tag", () => {
    const crest = defaultCrest("FRX");
    expect(crest).toEqual(defaultCrest("frx"));
    expect(crest.symbol).toBe("letter");
    expect(crest.field).not.toBe(crest.charge);
    expect(crestOf(null, "FRX")).toEqual(crest);
    expect(crestOf("round:red:white:star", "FRX").shape).toBe("round");
  });
});
