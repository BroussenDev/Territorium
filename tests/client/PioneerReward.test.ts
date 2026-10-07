import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/client/Utils", () => ({
  translateText: (key: string) => key,
  formatKeyForDisplay: (code: string) => code,
  KEYBOARD_LAYOUT_READY_EVENT: "keyboard-layout-ready",
}));
const markPioneerSeen = vi.hoisted(() => vi.fn(async () => true));
vi.mock("../../src/client/Api", () => ({ markPioneerSeen }));

import { FIRST_LAUNCH_DONE_EVENT } from "../../src/client/components/FirstLaunchLanguage";
import { PioneerReward } from "../../src/client/components/PioneerReward";

if (!customElements.get("pioneer-reward")) {
  customElements.define("pioneer-reward", PioneerReward);
}

const fireUserMe = (pioneer: unknown) =>
  document.dispatchEvent(
    new CustomEvent("userMeResponse", {
      detail: { user: {}, player: {}, pioneer },
    }),
  );

async function mount() {
  const el = document.createElement("pioneer-reward") as PioneerReward;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

const shown = (el: HTMLElement) => el.querySelector('[role="dialog"]') !== null;

beforeEach(() => markPioneerSeen.mockClear());
afterEach(() => {
  document.body.innerHTML = "";
});

describe("pioneer reward screen", () => {
  it("shows once for a badge not seen yet, and records it on Continue", async () => {
    const el = await mount();
    fireUserMe({ since: "2026-10-07T00:00:00.000Z", seen: false });
    await el.updateComplete;
    expect(shown(el)).toBe(true);
    el.querySelector<HTMLButtonElement>("[data-pioneer-continue]")!.click();
    await el.updateComplete;
    expect(shown(el)).toBe(false);
    expect(markPioneerSeen).toHaveBeenCalledOnce();
  });

  it("stays hidden without the badge or once seen", async () => {
    const el = await mount();
    fireUserMe(null);
    await el.updateComplete;
    expect(shown(el)).toBe(false);
    fireUserMe({ since: "2026-10-07T00:00:00.000Z", seen: true });
    await el.updateComplete;
    expect(shown(el)).toBe(false);
  });

  it("waits for the first-launch setup to close", async () => {
    const el = await mount();
    const setup = document.createElement("first-launch-language");
    document.body.appendChild(setup);
    fireUserMe({ since: "2026-10-07T00:00:00.000Z", seen: false });
    await el.updateComplete;
    expect(shown(el)).toBe(false);
    setup.remove();
    window.dispatchEvent(new Event(FIRST_LAUNCH_DONE_EVENT));
    await el.updateComplete;
    expect(shown(el)).toBe(true);
  });
});
