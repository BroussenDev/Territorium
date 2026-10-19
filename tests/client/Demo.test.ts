import { afterEach, describe, expect, it } from "vitest";
import {
  DEMO_MAPS,
  DEMO_SURVIVAL_MAPS,
  demoAllowsMap,
  isDemo,
  randomDemoMap,
} from "../../src/client/Demo";
import { GameMapType } from "../../src/core/game/Game";
import { SURVIVAL_MAPS } from "../../src/core/game/Survival";

// The Steam demo app sets window.__TERRITORIUM_DEMO__; everything the demo
// hides or narrows keys off isDemo().
type DemoWindow = { __TERRITORIUM_DEMO__?: unknown };

afterEach(() => {
  delete (window as DemoWindow).__TERRITORIUM_DEMO__;
});

describe("Demo", () => {
  it("is off unless the app says so", () => {
    expect(isDemo()).toBe(false);
    (window as DemoWindow).__TERRITORIUM_DEMO__ = "yes";
    expect(isDemo()).toBe(false);
    (window as DemoWindow).__TERRITORIUM_DEMO__ = true;
    expect(isDemo()).toBe(true);
  });

  it("allows every map in the full game", () => {
    for (const map of Object.values(GameMapType)) {
      expect(demoAllowsMap(map)).toBe(true);
    }
  });

  it("allows only its maps and the training's in the demo", () => {
    (window as DemoWindow).__TERRITORIUM_DEMO__ = true;
    for (const map of DEMO_MAPS) expect(demoAllowsMap(map)).toBe(true);
    expect(demoAllowsMap(GameMapType.BlackSea)).toBe(true);
    const others = Object.values(GameMapType).filter(
      (m) => !DEMO_MAPS.includes(m) && m !== GameMapType.BlackSea,
    );
    expect(others.length).toBeGreaterThan(0);
    for (const map of others) expect(demoAllowsMap(map)).toBe(false);
  });

  it("plays Survival on maps Survival supports", () => {
    expect(DEMO_SURVIVAL_MAPS.length).toBeGreaterThan(0);
    for (const map of DEMO_SURVIVAL_MAPS) {
      expect(SURVIVAL_MAPS).toContain(map);
      expect(DEMO_MAPS).toContain(map);
    }
  });

  it("picks random maps among its own", () => {
    for (let i = 0; i < 50; i++) expect(DEMO_MAPS).toContain(randomDemoMap());
  });
});
