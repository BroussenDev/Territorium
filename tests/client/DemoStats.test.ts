import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordDemoGame } from "../../src/client/Demo";
import { countDemo } from "../../src/client/DemoStats";

// The demo's anonymous admin counts: only in the demo, once per game.
type DemoWindow = { __TERRITORIUM_DEMO__?: unknown };
const pending = () =>
  JSON.parse(localStorage.getItem("demoStatsPending") ?? "{}");

beforeEach(() => {
  (window as DemoWindow).__TERRITORIUM_DEMO__ = true;
  localStorage.clear();
});
afterEach(() => {
  delete (window as DemoWindow).__TERRITORIUM_DEMO__;
  vi.restoreAllMocks();
});

describe("Demo stats", () => {
  it("counts nothing outside the demo", () => {
    delete (window as DemoWindow).__TERRITORIUM_DEMO__;
    countDemo("launch");
    expect(pending()).toEqual({});
  });

  it("sums counts until they are sent", () => {
    countDemo("launch");
    countDemo("minutes_app", 2);
    countDemo("minutes_app");
    expect(pending()).toEqual({ launch: 1, minutes_app: 3 });
  });

  it("counts a finished game once, with its mode, result and wave", () => {
    recordDemoGame("g1", { won: false, wave: 4 });
    recordDemoGame("g1", { won: true, wave: 10 });
    recordDemoGame("g2", { won: true });
    recordDemoGame("g3", { won: false, tutorial: true });
    expect(pending()).toEqual({
      finished_survival: 1,
      survival_wave_4: 1,
      won_survival: 1,
      finished_solo: 1,
      won_solo: 1,
      finished_tutorial: 1,
    });
  });
});
