import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/client/Utils", () => ({
  translateText: (key: string) => key,
  formatKeyForDisplay: (code: string) => code,
  KEYBOARD_LAYOUT_READY_EVENT: "keyboard-layout-ready",
}));
const desktop = vi.hoisted(() => ({ inApp: false }));
vi.mock("../../src/client/DesktopShell", () => ({
  isDesktopShell: () => desktop.inApp,
}));
const overlay = vi.hoisted(() => vi.fn(() => true));
vi.mock("../../src/client/Workshop", () => ({ openInSteamOverlay: overlay }));

import {
  DELUXE_DLC_APP_ID,
  StoreEditions,
} from "../../src/client/components/StoreEditions";
import type { UserMeResponse } from "../../src/core/ApiSchemas";

if (!customElements.get("store-editions")) {
  customElements.define("store-editions", StoreEditions);
}

async function mount(user: unknown = false) {
  const el = document.createElement("store-editions") as StoreEditions;
  el.userMeResponse = user as UserMeResponse | false;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

const text = (el: Element) => el.textContent ?? "";

afterEach(() => {
  document.body.innerHTML = "";
  desktop.inApp = false;
  overlay.mockClear();
});

describe("store editions", () => {
  it("compares the two editions row by row", async () => {
    const el = await mount();
    const rows = el.querySelectorAll("[role=row]");
    // Header, 3 game rows, 6 Steam perks, 5 Deluxe rows, footer.
    expect(rows.length).toBe(16);
    const deluxeOnly = [...rows].filter((r) =>
      r.querySelector("[aria-label='store.editions.not_included']"),
    );
    expect(deluxeOnly.map((r) => text(r).trim().split(/\s+/)[0])).toEqual([
      "deluxe.badge",
      "deluxe_reward.item_emblem",
      "deluxe_reward.item_patterns",
      "deluxe_reward.item_frame",
      "deluxe_reward.item_subscription",
    ]);
  });

  it("links both editions to Steam on the website", async () => {
    const el = await mount();
    const links = [...el.querySelectorAll("a")].map((a) => a.href);
    expect(links).toHaveLength(2);
    expect(links[0]).toContain("store.steampowered.com/app/5369890");
    expect(links[1]).toContain(
      `store.steampowered.com/app/${DELUXE_DLC_APP_ID}`,
    );
  });

  it("in the Steam app, owns the game and opens the Deluxe in the overlay", async () => {
    desktop.inApp = true;
    const el = await mount({ player: {}, deluxe: null });
    expect(text(el)).toContain("store.editions.owned");
    const link = el.querySelector("a")!;
    link.click();
    expect(overlay).toHaveBeenCalledWith(link.href);
  });

  it("says when the player owns the Deluxe", async () => {
    desktop.inApp = true;
    const el = await mount({
      player: {},
      deluxe: { since: "2026-10-09T00:00:00.000Z", seen: true },
    });
    expect(el.querySelectorAll("a")).toHaveLength(0);
    expect(text(el).match(/store\.editions\.owned/g)).toHaveLength(2);
  });
});
