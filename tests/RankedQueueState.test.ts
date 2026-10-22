import { describe, expect, it } from "vitest";
import { RankedQueueStateSchema } from "../src/core/ApiSchemas";

// The ranked queue's heartbeat. The API matches players by level and says
// which ratings it searches now (wider the longer the wait), or null once
// it takes every level; an older API leaves the field out.
describe("RankedQueueStateSchema", () => {
  const queue = {
    count: 5,
    min: 8,
    max: 16,
    lowMin: 4,
    startsIn: null,
    lowIn: 120,
  };

  it("reads the searched ratings", () => {
    const state = RankedQueueStateSchema.parse({
      ...queue,
      searching: { from: 850, to: 1150 },
    });
    expect(state).toMatchObject({ searching: { from: 850, to: 1150 } });
  });

  it("reads a search open to every level", () => {
    expect(
      RankedQueueStateSchema.parse({ ...queue, searching: null }),
    ).toMatchObject({ searching: null });
  });

  it("still reads an API that predates level matching", () => {
    const state = RankedQueueStateSchema.parse(queue);
    expect("searching" in state ? state.searching : undefined).toBeUndefined();
  });

  it("reads the matched game", () => {
    expect(RankedQueueStateSchema.parse({ gameId: "aBc123" })).toEqual({
      gameId: "aBc123",
    });
  });
});
