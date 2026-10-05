import { describe, expect, it } from "vitest";
import {
  DESYNC_CHECKS,
  TGS_DESYNC_CODE,
  TGS_FLOOD_CODE,
  TgsMonitor,
  TgsSwitch,
} from "../../src/server/Tgs";

/** A monitor on a clock the test moves. */
function setup(enabled = true) {
  let now = 1_000_000;
  const tgsSwitch = new TgsSwitch();
  tgsSwitch.set(enabled);
  const monitor = new TgsMonitor(tgsSwitch, () => now);
  // Sends `perSecond` intents spread over each of `seconds` seconds and
  // returns the first disconnection code, if any.
  const send = (perSecond: number, seconds: number) => {
    for (let s = 0; s < seconds; s++) {
      for (let i = 0; i < perSecond; i++) {
        now += Math.floor(1000 / perSecond);
        const code = monitor.observeIntent("AAAAAAAA", 0);
        if (code !== null) return code;
      }
      now = Math.ceil(now / 1000) * 1000;
    }
    return null;
  };
  return { monitor, tgsSwitch, send };
}

describe("TGS flood watch", () => {
  it("disconnects with TGS-101 after more than 2 s above 35 intents/s", () => {
    const { monitor, send } = setup();
    expect(send(40, 4)).toBe(TGS_FLOOD_CODE);
    const report = monitor.report()!;
    expect(report.incidents).toHaveLength(1);
    expect(report.incidents[0]).toMatchObject({
      clientID: "AAAAAAAA",
      code: TGS_FLOOD_CODE,
    });
    expect(
      report.markers.some(
        (m) => m.anomaly === "TGS_MACRO_SPIKE" && m.value > 35,
      ),
    ).toBe(true);
  });

  it("never disconnects a burst of 12 intents/s", () => {
    const { monitor, send } = setup();
    expect(send(12, 30)).toBeNull();
    expect(monitor.report()).toBeUndefined();
  });

  it("forgives a single second of flood", () => {
    const { send } = setup();
    expect(send(40, 1)).toBeNull();
    expect(send(10, 3)).toBeNull();
  });

  it("marks a burst above 15/s without disconnecting it", () => {
    const { monitor, send } = setup();
    expect(send(20, 3)).toBeNull();
    const markers = monitor.report()!.markers;
    expect(markers.length).toBeGreaterThan(0);
    expect(markers.every((m) => m.anomaly === "TGS_MACRO_SPIKE")).toBe(true);
    expect(monitor.report()!.incidents).toHaveLength(0);
  });

  it("does nothing at all while switched off", () => {
    const { monitor, send } = setup(false);
    expect(send(100, 10)).toBeNull();
    expect(monitor.report()).toBeUndefined();
  });
});

describe("TGS desync watch", () => {
  const players = ["AAAAAAAA", "BBBBBBBB", "CCCCCCCC", "DDDDDDDD"];

  it("disconnects with TGS-102 a player out of step check after check", () => {
    const { monitor } = setup();
    for (let i = 1; i < DESYNC_CHECKS; i++) {
      expect(monitor.observeDesync(i * 10, players, ["BBBBBBBB"])).toEqual([]);
    }
    expect(
      monitor.observeDesync(DESYNC_CHECKS * 10, players, ["BBBBBBBB"]),
    ).toEqual(["BBBBBBBB"]);
    expect(monitor.report()!.incidents[0].code).toBe(TGS_DESYNC_CODE);
  });

  it("starts over when the player is back in step", () => {
    const { monitor } = setup();
    monitor.observeDesync(10, players, ["BBBBBBBB"]);
    monitor.observeDesync(20, players, ["BBBBBBBB"]);
    monitor.observeDesync(30, players, []);
    expect(monitor.observeDesync(40, players, ["BBBBBBBB"])).toEqual([]);
  });

  it("disconnects nobody when most players disagree", () => {
    const { monitor } = setup();
    const most = ["AAAAAAAA", "BBBBBBBB", "CCCCCCCC"];
    for (let i = 1; i <= DESYNC_CHECKS + 2; i++) {
      expect(monitor.observeDesync(i * 10, players, most)).toEqual([]);
    }
  });

  it("does nothing while switched off", () => {
    const { monitor } = setup(false);
    for (let i = 1; i <= DESYNC_CHECKS + 2; i++) {
      expect(monitor.observeDesync(i * 10, players, ["BBBBBBBB"])).toEqual([]);
    }
  });
});
