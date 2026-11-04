import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setBugGameSource } from "../../src/client/BugContext";
import { BugReportModal, openBugReport } from "../../src/client/BugReport";

type TestModal = BugReportModal & { updateComplete: Promise<unknown> };

const source = (captured: HTMLCanvasElement | null) => ({
  captureFrame: async () => captured,
  snapshot: () => ({
    gameID: "g1",
    map: "World",
    mode: "Free For All",
    gameType: "Singleplayer",
    multiplayer: false,
    replay: false,
    tick: 10,
    elapsedSeconds: 1,
    spectator: false,
    alive: true,
    tiles: 5,
    fps: 60,
    gpu: null,
    quality: "normal",
  }),
});

describe("bug report screenshot choice", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    setBugGameSource(null);
  });

  async function modal(): Promise<TestModal> {
    openBugReport("g1");
    const el = document.querySelector("bug-report-modal") as TestModal;
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    return el;
  }

  it("offers no screenshot outside a game", async () => {
    const el = await modal();
    expect(el.querySelector("[data-bug-screenshot]")).toBeNull();
  });

  it("offers it, checked by default, inside a game", async () => {
    setBugGameSource(source(null));
    const el = await modal();
    const box = el.querySelector(
      "[data-bug-screenshot] input[type=checkbox]",
    ) as HTMLInputElement;
    expect(box).not.toBeNull();
    expect(box.checked).toBe(true);
  });

  it("says so when the picture could not be taken, and can be unticked", async () => {
    setBugGameSource(source(null));
    const el = await modal();
    expect(el.textContent).toContain("bug_report.screenshot_failed");
    const box = el.querySelector(
      "[data-bug-screenshot] input[type=checkbox]",
    ) as HTMLInputElement;
    box.checked = false;
    box.dispatchEvent(new Event("change", { bubbles: true }));
    await el.updateComplete;
    expect(el.textContent).not.toContain("bug_report.screenshot_failed");
  });
});
