import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/client/Utils", () => ({
  translateText: (key: string) => key,
  formatKeyForDisplay: (code: string) => code,
  KEYBOARD_LAYOUT_READY_EVENT: "keyboard-layout-ready",
}));
const markDeluxeSeen = vi.hoisted(() => vi.fn(async () => true));
const markPioneerSeen = vi.hoisted(() => vi.fn(async () => true));
vi.mock("../../src/client/Api", () => ({ markDeluxeSeen, markPioneerSeen }));

import { DeluxeReward } from "../../src/client/components/DeluxeReward";
import {
  PIONEER_REWARD_DONE_EVENT,
  PioneerReward,
} from "../../src/client/components/PioneerReward";

if (!customElements.get("deluxe-reward")) {
  customElements.define("deluxe-reward", DeluxeReward);
}
if (!customElements.get("pioneer-reward")) {
  customElements.define("pioneer-reward", PioneerReward);
}

const UNSEEN = { since: "2026-10-09T00:00:00.000Z", seen: false };

function fireUserMe(detail: Record<string, unknown>) {
  document.dispatchEvent(
    new CustomEvent("userMeResponse", {
      detail: { user: {}, player: {}, ...detail },
    }),
  );
}

async function mount<
  T extends HTMLElement & { updateComplete: Promise<unknown> },
>(tag: string): Promise<T> {
  const el = document.createElement(tag) as T;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

const shown = (el: HTMLElement) => el.querySelector('[role="dialog"]') !== null;

beforeEach(() => markDeluxeSeen.mockClear());
afterEach(() => {
  document.body.innerHTML = "";
});

describe("deluxe reward screen", () => {
  it("shows the pack once and records it on Continue", async () => {
    const el = await mount<DeluxeReward>("deluxe-reward");
    fireUserMe({ deluxe: UNSEEN });
    await el.updateComplete;
    expect(shown(el)).toBe(true);
    expect(el.textContent).toContain("deluxe_reward.item_subscription");
    el.querySelector<HTMLButtonElement>("[data-deluxe-continue]")!.click();
    await el.updateComplete;
    expect(shown(el)).toBe(false);
    expect(markDeluxeSeen).toHaveBeenCalledOnce();
  });

  it("stays hidden without the pack or once seen", async () => {
    const el = await mount<DeluxeReward>("deluxe-reward");
    fireUserMe({ deluxe: null });
    await el.updateComplete;
    expect(shown(el)).toBe(false);
    fireUserMe({ deluxe: { ...UNSEEN, seen: true } });
    await el.updateComplete;
    expect(shown(el)).toBe(false);
  });

  it("waits for the Pionnier screen to close first", async () => {
    const pioneer = await mount<PioneerReward>("pioneer-reward");
    const el = await mount<DeluxeReward>("deluxe-reward");
    fireUserMe({ deluxe: UNSEEN, pioneer: UNSEEN });
    await pioneer.updateComplete;
    await el.updateComplete;
    expect(shown(pioneer)).toBe(true);
    expect(shown(el)).toBe(false);
    pioneer
      .querySelector<HTMLButtonElement>("[data-pioneer-continue]")!
      .click();
    await pioneer.updateComplete;
    window.dispatchEvent(new Event(PIONEER_REWARD_DONE_EVENT));
    await el.updateComplete;
    expect(shown(el)).toBe(true);
  });
});
