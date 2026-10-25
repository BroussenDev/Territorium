import { describe, expect, it } from "vitest";
import type { StampedIntent } from "../../src/core/Schemas";
import { TgsSwitch } from "../../src/server/Tgs";
import {
  LIVE_GIFTS,
  RankedWatch,
  RHYTHM_WINDOW,
} from "../../src/server/TgsRanked";

const A = "AAAAAAAA";
const B = "BBBBBBBB";
const C = "CCCCCCCC";
const gift = (from: string, to: string) =>
  ({
    type: "donate_troops",
    clientID: from,
    recipient: to,
    troops: 100,
  }) as unknown as StampedIntent;
const attack = (from: string) =>
  ({
    type: "attack",
    clientID: from,
    targetID: null,
    troops: 10,
  }) as unknown as StampedIntent;

describe("TGS live ranked watch", () => {
  it("cancels for players on the same network", () => {
    const watch = new RankedWatch([A, B, C]);
    const v = watch.atStart([
      { clientID: A, ip: "1.1.1.1" },
      { clientID: B, ip: "2.2.2.2" },
      { clientID: C, ip: "1.1.1.1" },
    ]);
    expect(v?.code).toBe("TGS-106");
    expect(v?.cheaters.sort()).toEqual([A, C]);
  });

  it("cancels for repeated gifts to a rival, the receiver too when it gave back", () => {
    const watch = new RankedWatch([A, B, C]);
    expect(watch.observe(gift(B, A), 10)).toBeNull();
    for (let i = 1; i < LIVE_GIFTS; i++)
      expect(watch.observe(gift(A, B), 20 + i)).toBeNull();
    const v = watch.observe(gift(A, B), 100);
    expect(v?.code).toBe("TGS-104");
    expect(v?.cheaters.sort()).toEqual([A, B]);
    // Decided once.
    expect(watch.observe(gift(A, B), 200)).toBeNull();
  });

  it("cancels for a machine rhythm, never for a human one", () => {
    const bot = new RankedWatch([A]);
    let v = null;
    for (let i = 0; i < RHYTHM_WINDOW; i++) v = bot.observe(attack(A), i * 15);
    expect(v?.code).toBe("TGS-105");

    const human = new RankedWatch([B]);
    let t = 0;
    for (let i = 0; i < RHYTHM_WINDOW * 3; i++) {
      t += 8 + ((i * 37) % 23);
      expect(human.observe(attack(B), t)).toBeNull();
    }
  });

  it("does nothing while TGS is off", () => {
    const off = new TgsSwitch();
    off.set(false);
    const watch = new RankedWatch([A, B], off);
    expect(
      watch.atStart([
        { clientID: A, ip: "x" },
        { clientID: B, ip: "x" },
      ]),
    ).toBeNull();
    for (let i = 0; i < 5; i++) expect(watch.observe(gift(A, B), i)).toBeNull();
  });
});
