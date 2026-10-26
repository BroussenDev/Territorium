import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClientEnv } from "../../src/client/ClientEnv";
import {
  cleanStack,
  flushTelemetry,
  pendingReport,
  reportGameError,
  reportMeasurement,
  resetTelemetry,
} from "../../src/client/Telemetry";

function page(gameEnv: string) {
  ClientEnv.reset();
  (window as any).BOOTSTRAP_CONFIG = {
    gameEnv,
    turnstileSiteKey: "site-key",
    jwtAudience: "territorium.gg",
    gitCommit: "abc1234",
  };
}

const summary = { p50: 16, p90: 20, p99: 33, count: 120 };

describe("Telemetry", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetTelemetry();
    fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as any).BOOTSTRAP_CONFIG;
    ClientEnv.reset();
  });

  it("collects and sends nothing in development", () => {
    page("dev");
    reportMeasurement("frame_time", summary);
    reportGameError("boom", "crashed");
    expect(pendingReport()).toBeNull();
    flushTelemetry(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a batch to our own API, without any identifier", () => {
    page("prod");
    reportMeasurement("tick_execution", summary);
    reportGameError("worker failed", "error_modal.crashed");
    reportGameError("worker failed", "error_modal.crashed");
    flushTelemetry(false);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/telemetry$/);
    expect(String(url)).not.toMatch(/faro|grafana/);
    const body = JSON.parse(init.body);
    expect(body.measurements).toEqual([{ type: "tick_execution", ...summary }]);
    expect(body.errors).toEqual([
      { type: "error_modal.crashed", error: "worker failed", count: 2 },
    ]);
    expect(body.platform).toBe("web");
    expect(body.quality).toBe("high");
    // Only these fields: nothing about the player, the game or the session.
    expect(Object.keys(body).sort()).toEqual(
      [
        "errors",
        "fpsCap",
        "measurements",
        "platform",
        "quality",
        "version",
      ].sort(),
    );
  });

  it("empties the batch once sent", () => {
    page("prod");
    reportMeasurement("frame_time", summary);
    flushTelemetry(false);
    flushTelemetry(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caps the errors kept between two sends", () => {
    page("prod");
    for (let i = 0; i < 50; i++) reportGameError(`error ${i}`, "crashed");
    expect(pendingReport()!.errors).toHaveLength(10);
  });
  it("keeps only the game's own frames of a stack, without any address", () => {
    const chrome = [
      "TypeError: x is undefined",
      "    at Shop.render (https://territorium.gg/assets/index-B2x9.js:1:2345)",
      "    at chrome-extension://abc/content.js:3:4",
      "    at https://territorium.gg/assets/vendor-Q1.js?v=2:10:20",
    ].join("\n");
    expect(cleanStack(chrome)).toBe(
      "Shop.render index-B2x9.js:1:2345\n? vendor-Q1.js:10:20",
    );
    expect(
      cleanStack("render@https://territorium.gg/assets/Worker.worker-z.js:2:9"),
    ).toBe("render Worker.worker-z.js:2:9");
    expect(cleanStack("no frames here")).toBeUndefined();
    expect(cleanStack(undefined)).toBeUndefined();
  });

  it("sends the cleaned stack with the error, and ignores others' errors", () => {
    page("prod");
    reportGameError(
      "boom",
      "crash.page",
      "Error: boom\n    at a (https://territorium.gg/assets/index-A.js:1:5)",
    );
    reportGameError("Script error.", "crash.page");
    reportGameError("ResizeObserver loop completed", "crash.page");
    expect(pendingReport()!.errors).toEqual([
      {
        type: "crash.page",
        error: "boom",
        count: 1,
        stack: "a index-A.js:1:5",
      },
    ]);
  });
});
