import { afterEach, describe, expect, it } from "vitest";
import {
  DEMO_MAPS,
  DEMO_SURVIVAL_MAPS,
  demoAllowsMap,
  demoStats,
  isDemo,
  randomDemoMap,
  recordDemoGame,
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

describe("Demo records", () => {
  afterEach(() => localStorage.removeItem("demoStats"));

  it("starts empty and survives unreadable storage", () => {
    expect(demoStats()).toMatchObject({ games: 0, wins: 0, bestWave: 0 });
    localStorage.setItem("demoStats", "{not json");
    expect(demoStats().games).toBe(0);
  });

  it("counts each game once, however often its end shows", () => {
    recordDemoGame("a", { won: false, wave: 3 });
    // The same Survival game ends after the player died: a win, wave 10.
    recordDemoGame("a", { won: true, wave: 10 });
    recordDemoGame("a", { won: true, wave: 10 });
    expect(demoStats()).toMatchObject({ games: 1, wins: 1, bestWave: 10 });
    recordDemoGame("b", { won: false, wave: 4 });
    recordDemoGame("c", { won: true });
    expect(demoStats()).toMatchObject({ games: 3, wins: 2, bestWave: 10 });
  });
});
