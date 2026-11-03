import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MIN_VIDEO_SNAPSHOTS,
  ReplayVideoPanel,
  videoPanelVisible,
} from "../../src/client/replayVideo/ReplayVideoPanel";
import type { TerritorySnapshotRecorder } from "../../src/client/replayVideo/TerritorySnapshots";

vi.mock("../../src/client/Utils", () => ({
  translateText: vi.fn((key: string) => key),
}));

describe("videoPanelVisible", () => {
  const ready = { gameOver: true, supported: true, snapshotCount: 40 };

  it("shows the button once the game is over and a video can be made", () => {
    expect(videoPanelVisible(ready)).toBe(true);
  });

  it("hides it while the game is still going", () => {
    expect(videoPanelVisible({ ...ready, gameOver: false })).toBe(false);
  });

  it("hides it when the browser cannot record a canvas", () => {
    expect(videoPanelVisible({ ...ready, supported: false })).toBe(false);
  });

  it("hides it when there are too few snapshots for a video", () => {
    expect(
      videoPanelVisible({ ...ready, snapshotCount: MIN_VIDEO_SNAPSHOTS - 1 }),
    ).toBe(false);
    expect(videoPanelVisible({ ...ready, snapshotCount: 0 })).toBe(false);
  });
});

/** The recorder surface the panel reads: a count and a subscription. */
function fakeRecorder(frameCount: number): TerritorySnapshotRecorder {
  return {
    frameCount: () => frameCount,
    recording: () => null,
    subscribe: () => () => {},
  } as unknown as TerritorySnapshotRecorder;
}

describe("replay-video-panel", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  async function mountPanel(props: {
    enabled: boolean;
    supported: boolean;
    frames: number;
  }) {
    const panel = document.createElement(
      "replay-video-panel",
    ) as ReplayVideoPanel;
    panel.enabled = props.enabled;
    panel.supported = props.supported;
    panel.recorder = fakeRecorder(props.frames);
    document.body.append(panel);
    await panel.updateComplete;
    return panel;
  }

  it("renders the button when the video can be made", async () => {
    const panel = await mountPanel({
      enabled: true,
      supported: true,
      frames: 40,
    });
    expect(panel.querySelector("[data-video-start]")).not.toBeNull();
    expect(panel.querySelectorAll("[data-video-format]")).toHaveLength(2);
  });

  it("renders nothing when recording is unsupported", async () => {
    const panel = await mountPanel({
      enabled: true,
      supported: false,
      frames: 40,
    });
    expect(panel.querySelector("[data-video-start]")).toBeNull();
  });

  it("renders nothing before the game is over", async () => {
    const panel = await mountPanel({
      enabled: false,
      supported: true,
      frames: 40,
    });
    expect(panel.querySelector("[data-video-start]")).toBeNull();
  });

  it("renders nothing without snapshots", async () => {
    const panel = await mountPanel({
      enabled: true,
      supported: true,
      frames: 0,
    });
    expect(panel.querySelector("[data-video-start]")).toBeNull();
  });

  it("switches the format when a format button is pressed", async () => {
    const panel = await mountPanel({
      enabled: true,
      supported: true,
      frames: 40,
    });
    const vertical = panel.querySelector<HTMLButtonElement>(
      '[data-video-format="vertical"]',
    )!;
    vertical.click();
    await panel.updateComplete;
    expect(vertical.getAttribute("aria-checked")).toBe("true");
  });
});
