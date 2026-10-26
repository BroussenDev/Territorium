import { describe, expect, it, vi } from "vitest";
import { GameEnv } from "../../src/core/configuration/Config";
import type { StampedIntent } from "../../src/core/Schemas";
import { ServerEnv } from "../../src/server/ServerEnv";
import {
  DEFAULT_TGS_SETTINGS,
  parseTgsSettings,
  TGS_FLOOD_CODE,
  TgsMonitor,
  TgsSwitch,
} from "../../src/server/Tgs";
import { startTgsStatusPoller } from "../../src/server/TgsApi";
import { RankedWatch } from "../../src/server/TgsRanked";

describe("TGS thresholds from the admin panel", () => {
  it("keeps the defaults for anything missing, out of range or not a number", () => {
    const s = parseTgsSettings({
      floodPerSecond: 50,
      desyncChecks: 0,
      rankedGifts: "5",
      rhythmMaxVariation: 0.9,
      unknown: 3,
    });
    expect(s.floodPerSecond).toBe(50);
    expect(s.desyncChecks).toBe(DEFAULT_TGS_SETTINGS.desyncChecks);
    expect(s.rankedGifts).toBe(DEFAULT_TGS_SETTINGS.rankedGifts);
    expect(s.rhythmMaxVariation).toBe(DEFAULT_TGS_SETTINGS.rhythmMaxVariation);
    expect(s).not.toHaveProperty("unknown");
    expect(parseTgsSettings(null)).toEqual(DEFAULT_TGS_SETTINGS);
  });

  it("never lets the rhythm's longest spread fall under its shortest", () => {
    const s = parseTgsSettings({ rhythmMinMinutes: 10, rhythmMaxMinutes: 4 });
    expect(s.rhythmMaxMinutes).toBe(10);
  });

  it("a new flood threshold changes when a player is disconnected", () => {
    let now = 1_000_000;
    const sw = new TgsSwitch();
    sw.setSettings({ floodPerSecond: 60 });
    const monitor = new TgsMonitor(sw, () => now);
    const send = (perSecond: number, seconds: number) => {
      let code = null;
      for (let s = 0; s < seconds && code === null; s++) {
        for (let i = 0; i < perSecond && code === null; i++) {
          code = monitor.observeIntent("AAAAAAAA", s);
        }
        now += 1000;
      }
      return code;
    };
    // Past the default 35 a second but under the panel's 60.
    expect(send(40, 5)).toBeNull();
    expect(send(70, 5)).toBe(TGS_FLOOD_CODE);
  });

  it("a ranked game follows the panel's number of gifts", () => {
    const sw = new TgsSwitch();
    sw.setSettings({ rankedGifts: 5 });
    const watch = new RankedWatch(["AAAAAAAA", "BBBBBBBB"], sw);
    const gift = {
      type: "donate_gold",
      clientID: "AAAAAAAA",
      recipient: "BBBBBBBB",
      gold: 10,
    } as unknown as StampedIntent;
    for (let i = 1; i < 5; i++) expect(watch.observe(gift, i)).toBeNull();
    expect(watch.observe(gift, 5)?.code).toBe("TGS-104");
  });

  it("the status poller takes the thresholds the API sends", async () => {
    vi.spyOn(ServerEnv, "env").mockReturnValue(GameEnv.Prod);
    vi.spyOn(ServerEnv, "jwtIssuer").mockReturnValue("https://api.test");
    vi.spyOn(ServerEnv, "apiKey").mockReturnValue("key");
    const sw = new TgsSwitch();
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({ enabled: true, settings: { desyncChecks: 7 } }),
      )) as typeof fetch;
    const stop = startTgsStatusPoller(sw, fetchImpl);
    await new Promise((r) => setTimeout(r, 0));
    stop();
    vi.restoreAllMocks();
    expect(sw.settings().desyncChecks).toBe(7);
  });
});
