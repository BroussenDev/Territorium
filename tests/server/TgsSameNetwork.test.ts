import { describe, expect, it } from "vitest";
import { sameNetworkGroups, TgsMonitor, TgsSwitch } from "../../src/server/Tgs";

describe("TGS same-network players", () => {
  const players = new Set(["AAAAAAAA", "BBBBBBBB", "CCCCCCCC", "DDDDDDDD"]);

  it("groups the players who shared an IP, without the address", () => {
    const groups = sameNetworkGroups(
      [
        { clientID: "AAAAAAAA", ip: "1.2.3.4" },
        { clientID: "BBBBBBBB", ip: "1.2.3.4" },
        { clientID: "CCCCCCCC", ip: "5.6.7.8" },
        // A spectator or a client that never played is left out.
        { clientID: "ZZZZZZZZ", ip: "5.6.7.8" },
      ],
      players,
    );
    expect(groups).toEqual([["AAAAAAAA", "BBBBBBBB"]]);
    expect(JSON.stringify(groups)).not.toContain("1.2.3.4");
  });

  it("goes into the record's TGS report, unless TGS is off", () => {
    const on = new TgsMonitor();
    on.observeSameNetwork([["AAAAAAAA", "BBBBBBBB"]]);
    expect(on.report()?.sameNetwork).toEqual([["AAAAAAAA", "BBBBBBBB"]]);
    const off = new TgsSwitch();
    off.set(false);
    const monitor = new TgsMonitor(off);
    monitor.observeSameNetwork([["AAAAAAAA", "BBBBBBBB"]]);
    expect(monitor.report()).toBeUndefined();
  });
});
