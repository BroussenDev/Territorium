import { describe, expect, it } from "vitest";
import {
  VictoryAnimation,
  victoryColors,
} from "../../src/client/components/VictoryAnimation";

// A 2D context that accepts every call, so draw() can run under jsdom.
function fakeContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => {} };
  return new Proxy(
    {},
    {
      get: (_, key) =>
        key === "createLinearGradient" ? () => gradient : () => {},
      set: () => true,
    },
  ) as CanvasRenderingContext2D;
}

// Deterministic randomness for the particle counts.
function seeded(seed = 1): () => number {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

function run(animation: VictoryAnimation, seconds: number) {
  for (let t = 0; t < seconds; t += 0.05) animation.step(0.05, 800, 600);
}

describe("VictoryAnimation", () => {
  it("launches a firework at once, then dies down once emitting stops", () => {
    const fireworks = new VictoryAnimation(
      { type: "fireworks", colors: ["#ff0000"], density: 2 },
      null,
      seeded(),
    );
    fireworks.step(0.05, 800, 600);
    expect(fireworks.alive()).toBeGreaterThan(0);

    run(fireworks, 2);
    // Rockets have burst into sparks by now.
    expect(fireworks.alive()).toBeGreaterThan(20);
    fireworks.draw(fakeContext(), 800, 600);

    fireworks.emitting = false;
    run(fireworks, 4);
    expect(fireworks.alive()).toBe(0);
  });

  it("keeps as many confetti falling as its density, within bounds", () => {
    const rain = new VictoryAnimation(
      { type: "confetti", colors: [], density: 120 },
      null,
      seeded(),
    );
    run(rain, 1);
    expect(rain.alive()).toBe(120);

    const flood = new VictoryAnimation(
      { type: "confetti", colors: [], density: 100_000 },
      null,
      seeded(),
    );
    run(flood, 0.1);
    expect(flood.alive()).toBe(320);

    rain.emitting = false;
    run(rain, 15);
    expect(rain.alive()).toBe(0);
  });

  it("waves a flag, with or without a picture, until it stops", () => {
    const picture = document.createElement("canvas");
    picture.width = 300;
    picture.height = 200;
    for (const flag of [picture, null]) {
      const banner = new VictoryAnimation(
        { type: "giantFlag", colors: ["#facc15"], density: 40 },
        flag,
        seeded(),
      );
      run(banner, 1);
      expect(banner.alive()).toBe(1);
      banner.draw(fakeContext(), 800, 600);
      banner.emitting = false;
      banner.step(0.05, 800, 600);
      expect(banner.alive()).toBe(0);
    }
  });

  it("falls back to gold and white without a usable color", () => {
    expect(victoryColors(["nope", ""])).toEqual(["#facc15", "#ffffff"]);
    expect(victoryColors(["nope", "#123456"])).toEqual(["#123456"]);
  });
});
