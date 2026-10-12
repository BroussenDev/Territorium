import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClientEnv } from "../src/client/ClientEnv";
import "../src/client/components/DesktopStatusBar";
import { barSource } from "../src/client/components/DesktopStatusBar";
import {
  backendUnreachableConfirmed,
  ensureServerList,
  resetServerList,
  retryServerList,
} from "../src/client/ServerList";

// Matches RETRY_BUTTON_COOLDOWN_MS in the component.
const COOLDOWN_MS = 5_000;

describe("barSource", () => {
  it("shows nothing when signed in and the backend is fine", () => {
    expect(barSource({ status: "signed-in" }, false)).toBe("none");
  });

  it("shows the session when signed out", () => {
    expect(
      barSource({ status: "signed-out", reason: "steam-wedged" }, false),
    ).toBe("session");
  });

  it("shows nothing on the web, where there is no session state", () => {
    expect(barSource(null, false)).toBe("none");
  });

  // OPE-439. Below the session, because a session failure names a more
  // specific remedy.
  it("shows the offline state when the backend is unreachable", () => {
    expect(barSource(null, true)).toBe("reachability");
    expect(barSource({ status: "signed-in" }, true)).toBe("reachability");
  });

  it("still shows the session over the offline state", () => {
    expect(barSource({ status: "signed-out", reason: "network" }, true)).toBe(
      "session",
    );
  });

  // The argument is the CONFIRMED outage, so "unsettled" and "missed once"
  // both arrive here as false and show nothing. There is no neutral state in
  // this bar to hang a "Checking…" on, and inventing one would put a strip
  // across the bottom of a healthy game every time one request timed out.
  it("shows nothing until an outage is confirmed", () => {
    expect(barSource({ status: "signed-in" }, false)).toBe("none");
    expect(barSource(null, false)).toBe("none");
  });
});

/**
 * The rendered offline state and its Retry, driven through the REAL
 * ServerList module rather than a mock of it: the seed (backendReachable())
 * and the announcement ("backend-reachability") are the two halves this
 * feature actually depends on, and a mocked accessor would prove neither.
 */
describe("the rendered offline state", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  function mountBar(): HTMLElement & { updateComplete: Promise<unknown> } {
    const bar = document.createElement("desktop-status-bar") as HTMLElement & {
      updateComplete: Promise<unknown>;
    };
    document.body.appendChild(bar);
    return bar;
  }

  // The button, whichever label it is wearing. `retrying` has `retry` as a
  // prefix, so this matches on the shared stem rather than either key.
  function retryButton(bar: HTMLElement): HTMLButtonElement | undefined {
    return Array.from(bar.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("desktop_status.retry"),
    );
  }

  function buttonLabel(bar: HTMLElement): string {
    return retryButton(bar)!.textContent!.trim();
  }

  beforeEach(() => {
    // The bar renders nothing on the web, so every assertion here needs a
    // shell. No `update` bridge on it: a shell too old to expose one must
    // still show this.
    (window as { openfrontDesktop?: unknown }).openfrontDesktop = {};
    window.BOOTSTRAP_CONFIG = {
      gameEnv: "dev",
      numWorkers: 1,
      turnstileSiteKey: "",
      jwtAudience: "test",
      instanceId: "test",
      gitCommit: "test",
      serverHost: "openfront.io",
    } as unknown as typeof window.BOOTSTRAP_CONFIG;
    ClientEnv.reset();
    resetServerList();
    fetchMock = vi.fn(async () => {
      throw new TypeError("network down");
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    // Fake the clock only so the tests can step past the manual-retry floor
    // and the heartbeat's retry interval; shouldAdvanceTime keeps real time
    // flowing underneath, so vi.waitFor and Lit's microtasks behave normally.
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    document.body.innerHTML = "";
    (window as { openfrontDesktop?: unknown }).openfrontDesktop = undefined;
    window.BOOTSTRAP_CONFIG = undefined;
    ClientEnv.reset();
    resetServerList();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /**
   * Drives enough failed attempts that the outage is confirmed, then steps
   * past the manual-retry floor so a click in the test starts an attempt of
   * its own rather than joining this one.
   */
  async function confirmOutage(): Promise<void> {
    await ensureServerList();
    vi.advanceTimersByTime(2_000);
    await retryServerList();
    expect(backendUnreachableConfirmed()).toBe(true);
    vi.advanceTimersByTime(2_000);
  }

  it("shows nothing while the backend is fine", async () => {
    // The control: the bar must not become a permanent fixture just because
    // this feature exists.
    fetchMock.mockImplementation(
      async () => new Response("{}", { status: 404 }),
    );
    await ensureServerList();
    expect(backendUnreachableConfirmed()).toBe(false);

    const bar = mountBar();
    await bar.updateComplete;
    expect(bar.textContent?.trim()).toBe("");
  });

  it("shows nothing after a single missed attempt", async () => {
    // One timed-out heartbeat is a blip, not an outage. Showing an offline
    // bar for it -- while the cached list is still serving perfectly well --
    // would make the bar appear and vanish on any flaky connection.
    await ensureServerList();
    expect(backendUnreachableConfirmed()).toBe(false);

    const bar = mountBar();
    await bar.updateComplete;
    expect(bar.textContent?.trim()).toBe("");
  });

  it("seeds the offline state from failures that happened before it mounted", async () => {
    await confirmOutage();

    // Mounted AFTER the announcement it would have needed. The accessor is
    // the only path left, exactly as in OPE-396.
    const bar = mountBar();
    await bar.updateComplete;

    expect(bar.textContent).toContain("desktop_status.offline");
    expect(retryButton(bar)).toBeDefined();
  });

  it("picks the offline state up from the announcement when it mounts first", async () => {
    const bar = mountBar();
    await bar.updateComplete;
    expect(bar.textContent?.trim()).toBe("");

    await confirmOutage();
    await bar.updateComplete;

    expect(bar.textContent).toContain("desktop_status.offline");
  });

  it("Retry attempts again immediately, and the bar clears when the API answers", async () => {
    await confirmOutage();
    const bar = mountBar();
    await bar.updateComplete;
    const attemptsSoFar = fetchMock.mock.calls.length;

    // A 404 is an answer: this site has no list, but the backend is up. That
    // is the boundary the bar keys on, so it is the one worth clearing on.
    fetchMock.mockImplementation(
      async () => new Response("{}", { status: 404 }),
    );
    retryButton(bar)!.click();

    // Immediately, without waiting out the heartbeat's retry interval -- the
    // whole point of the button.
    expect(fetchMock).toHaveBeenCalledTimes(attemptsSoFar + 1);
    await vi.waitFor(() => expect(backendUnreachableConfirmed()).toBe(false));
    await bar.updateComplete;
    expect(bar.textContent?.trim()).toBe("");
  });

  it("disables Retry while its own attempt is still out", async () => {
    await confirmOutage();
    const bar = mountBar();
    await bar.updateComplete;

    // A request that never answers, so the in-flight window stays open.
    let release: (r: Response) => void = () => {};
    fetchMock.mockImplementation(
      async () =>
        await new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    const button = retryButton(bar)!;
    button.click();
    await bar.updateComplete;

    // A button that keeps accepting clicks while visibly doing nothing reads
    // as broken, whatever the throttle underneath is doing.
    expect(button.disabled).toBe(true);
    const attempts = fetchMock.mock.calls.length;
    button.click();
    expect(fetchMock).toHaveBeenCalledTimes(attempts);

    release(new Response("{}", { status: 404 }));
    await vi.waitFor(() => expect(backendUnreachableConfirmed()).toBe(false));
  });

  // The press's own attempt fails in milliseconds against a stubbed fetch,
  // so without a cooldown the button would come straight back and a player
  // watching an outage could sit there clicking it -- one real request each.
  it("keeps Retry disabled for the cooldown after a press, then re-enables it", async () => {
    await confirmOutage();
    const bar = mountBar();
    await bar.updateComplete;

    retryButton(bar)!.click();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // The attempt itself has settled by now; the cooldown is what is still
    // holding the button.
    await bar.updateComplete;
    expect(retryButton(bar)!.disabled).toBe(true);

    vi.advanceTimersByTime(COOLDOWN_MS - 1);
    await bar.updateComplete;
    expect(retryButton(bar)!.disabled).toBe(true);

    vi.advanceTimersByTime(1);
    await bar.updateComplete;
    expect(retryButton(bar)!.disabled).toBe(false);
    expect(buttonLabel(bar)).toBe("desktop_status.retry");
  });

  it("costs one attempt for a rapid double click", async () => {
    await confirmOutage();
    const bar = mountBar();
    await bar.updateComplete;
    const before = fetchMock.mock.calls.length;

    const button = retryButton(bar)!;
    button.click();
    button.click();
    button.click();

    expect(fetchMock).toHaveBeenCalledTimes(before + 1);
  });

  // The automatic half of the same protection: while the heartbeat is
  // already asking, a press could only ever join the attempt that is out, so
  // the button says what is happening instead of offering a no-op.
  it("disables Retry and says so while an automatic attempt is in flight", async () => {
    await confirmOutage();
    const bar = mountBar();
    await bar.updateComplete;
    expect(retryButton(bar)!.disabled).toBe(false);

    // Failing the attempt, not answering it: an answer would clear the
    // outage and take this whole bar away before the assertion.
    let fail: (e: unknown) => void = () => {};
    fetchMock.mockImplementation(
      async () =>
        await new Promise<Response>((_resolve, reject) => {
          fail = reject;
        }),
    );
    // Nobody clicked anything: this is the heartbeat's own beat. Stepping
    // past the backoff first, since two failures are already behind us.
    vi.advanceTimersByTime(60_000);
    const beat = ensureServerList();
    await bar.updateComplete;

    expect(retryButton(bar)!.disabled).toBe(true);
    expect(buttonLabel(bar)).toBe("desktop_status.retrying");
    expect(retryButton(bar)!.title).toBe("desktop_status.retrying");

    // Settling re-enables it: no click happened, so no cooldown is owed.
    fail(new TypeError("network down"));
    await beat;
    await bar.updateComplete;
    expect(retryButton(bar)!.disabled).toBe(false);
    expect(buttonLabel(bar)).toBe("desktop_status.retry");
  });

  it("stays disabled after an attempt settles if the click's cooldown is still running", async () => {
    await confirmOutage();
    const bar = mountBar();
    await bar.updateComplete;

    let fail: (e: unknown) => void = () => {};
    fetchMock.mockImplementation(
      async () =>
        await new Promise<Response>((_resolve, reject) => {
          fail = reject;
        }),
    );
    retryButton(bar)!.click();
    await bar.updateComplete;
    expect(retryButton(bar)!.disabled).toBe(true);

    // The attempt ends well inside the cooldown. Whichever ends LATER is the
    // one that governs, so the button is still held.
    vi.advanceTimersByTime(1_000);
    fail(new TypeError("network down"));
    await vi.waitFor(() =>
      expect(buttonLabel(bar)).toBe("desktop_status.retry"),
    );
    expect(retryButton(bar)!.disabled).toBe(true);

    vi.advanceTimersByTime(COOLDOWN_MS);
    await bar.updateComplete;
    expect(retryButton(bar)!.disabled).toBe(false);
  });
});

// A Retry on a gated session that lands back on the same reason (Steam is
// still not running) repaints nothing: the shell answers in milliseconds, so
// not even "Signing in…" is seen. The bar wiggles instead, so the press is
// visibly tried rather than reading as a dead button.
describe("Retry on a session state that does not change", () => {
  function mountBar(): HTMLElement & { updateComplete: Promise<unknown> } {
    const bar = document.createElement("desktop-status-bar") as HTMLElement & {
      updateComplete: Promise<unknown>;
    };
    document.body.appendChild(bar);
    return bar;
  }

  function setSession(detail: { status: string; reason?: string }) {
    document.dispatchEvent(
      new CustomEvent("desktop-session-state", { detail }),
    );
  }

  function strip(bar: HTMLElement): HTMLElement {
    return bar.querySelector('[role="status"]') as HTMLElement;
  }

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("wiggles when the retry settles on the same signed-out reason", async () => {
    const bar = mountBar();
    setSession({ status: "signed-out", reason: "steam-unavailable" });
    await bar.updateComplete;
    expect(strip(bar).classList.contains("animate-bounce")).toBe(false);

    bar.querySelector("button")!.click();
    setSession({ status: "retrying" });
    setSession({ status: "signed-out", reason: "steam-unavailable" });
    await bar.updateComplete;

    expect(strip(bar).classList.contains("animate-bounce")).toBe(true);
  });

  it("does not wiggle when the retry lands somewhere new", async () => {
    const bar = mountBar();
    setSession({ status: "signed-out", reason: "steam-unavailable" });
    await bar.updateComplete;

    bar.querySelector("button")!.click();
    setSession({ status: "retrying" });
    setSession({ status: "signed-out", reason: "network" });
    await bar.updateComplete;

    expect(strip(bar).classList.contains("animate-bounce")).toBe(false);
  });

  it("does not wiggle on a session change nobody pressed Retry for", async () => {
    const bar = mountBar();
    setSession({ status: "signed-out", reason: "steam-unavailable" });
    await bar.updateComplete;

    setSession({ status: "signed-out", reason: "steam-unavailable" });
    await bar.updateComplete;

    expect(strip(bar).classList.contains("animate-bounce")).toBe(false);
  });
});
