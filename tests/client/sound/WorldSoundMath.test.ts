import {
  AMBIENCE_FULL_SCALE,
  AMBIENCE_LAYERS,
  AMBIENCE_MIN_SCALE,
  ambienceLevels,
  countFactor,
  LAYER_CAP,
  placementCueFor,
  placementSoundFor,
  smoothToward,
  stationCue,
  TOTAL_CAP,
  worldVolumeGain,
  zoomFactor,
} from "../../../src/client/sound/WorldSoundMath";
import { UnitType } from "../../../src/core/game/Game";

const none = { city: 0, port: 0, factory: 0, rail: 0 };

describe("placement sound selection", () => {
  it("gives every placeable structure its own distinct sound", () => {
    const types = [
      UnitType.City,
      UnitType.Port,
      UnitType.Factory,
      UnitType.DefensePost,
      UnitType.MissileSilo,
      UnitType.SAMLauncher,
      UnitType.Radar,
      UnitType.Warship,
    ];
    const sounds = types.map((t) => placementSoundFor(t));
    expect(sounds.every((s) => s !== null)).toBe(true);
    expect(new Set(sounds).size).toBe(types.length);
  });

  it("has none for units that are not placed structures", () => {
    expect(placementSoundFor(UnitType.AtomBomb)).toBeNull();
    expect(placementSoundFor(UnitType.TradeShip)).toBeNull();
    expect(placementCueFor(UnitType.Shell, true)).toBeNull();
  });

  it("plays the synthesized cue when world sounds are on", () => {
    expect(placementCueFor(UnitType.Port, true)).toEqual({
      kind: "world",
      sound: "port",
    });
    expect(stationCue(true)).toEqual({ kind: "world", sound: "station" });
  });

  it("falls back to the recorded cue when world sounds are off", () => {
    expect(placementCueFor(UnitType.City, false)).toEqual({
      kind: "effect",
      effect: "build-city",
    });
    expect(stationCue(false)).toEqual({
      kind: "effect",
      effect: "build-train-station",
    });
  });
});

describe("ambience levels", () => {
  it("is silent when zoomed out or when nothing is in view", () => {
    expect(zoomFactor(AMBIENCE_MIN_SCALE)).toBe(0);
    expect(zoomFactor(0.5)).toBe(0);
    expect(ambienceLevels(2, { ...none, city: 10 })).toEqual(none);
    expect(ambienceLevels(20, none)).toEqual(none);
  });

  it("grows with zoom and with the number of structures", () => {
    const counts = { ...none, factory: 2 };
    const a = ambienceLevels(5, counts).factory;
    const b = ambienceLevels(9, counts).factory;
    expect(b).toBeGreaterThan(a);
    expect(zoomFactor(AMBIENCE_FULL_SCALE)).toBe(1);
    expect(countFactor(5)).toBeGreaterThan(countFactor(1));
    const few = ambienceLevels(15, { ...none, city: 1 }).city;
    const many = ambienceLevels(15, { ...none, city: 9 }).city;
    expect(many).toBeGreaterThan(few);
  });

  it("is capped per layer and across layers", () => {
    const one = ambienceLevels(20, { ...none, city: 500 });
    expect(one.city).toBeLessThanOrEqual(LAYER_CAP + 1e-9);
    const all = ambienceLevels(20, {
      city: 99,
      port: 99,
      factory: 99,
      rail: 99,
    });
    const sum = AMBIENCE_LAYERS.reduce((s, l) => s + all[l], 0);
    expect(sum).toBeLessThanOrEqual(TOTAL_CAP + 1e-9);
  });

  it("copes with junk input", () => {
    expect(zoomFactor(NaN)).toBe(0);
    expect(countFactor(-3)).toBe(0);
    expect(worldVolumeGain(NaN)).toBe(0);
    expect(worldVolumeGain(2)).toBe(1);
  });
});

describe("smoothing", () => {
  it("moves toward the target without overshooting", () => {
    let v = 0;
    for (let i = 0; i < 20; i++) {
      const next = smoothToward(v, 0.5, 500);
      expect(next).toBeGreaterThanOrEqual(v);
      expect(next).toBeLessThanOrEqual(0.5);
      v = next;
    }
    expect(v).toBeGreaterThan(0.49);
  });

  it("rises faster than it falls and ignores a zero step", () => {
    const up = smoothToward(0, 1, 500);
    const down = 1 - smoothToward(1, 0, 500);
    expect(up).toBeGreaterThan(down);
    expect(smoothToward(0.3, 1, 0)).toBe(0.3);
  });
});
