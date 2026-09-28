import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getCosmeticsHash, getGamesPlayed } = vi.hoisted(() => ({
  getCosmeticsHash: vi.fn(async () => "hash-2"),
  getGamesPlayed: vi.fn(() => 0),
}));
vi.mock("../../src/client/Cosmetics", () => ({ getCosmeticsHash }));
vi.mock("../../src/client/Utils", () => ({ getGamesPlayed }));
vi.mock("resources/version.txt?raw", () => ({ default: "v9.9.9" }));

import {
  NavNotificationsController,
  navNotifications,
} from "../../src/client/components/NavNotificationsController";

// Two components with their own controller — the bell lives in
// <nav-utility-icons>, the store dot in the nav bars.
function host() {
  const requestUpdate = vi.fn();
  const stub = {
    requestUpdate,
    addController: () => {},
    removeController: () => {},
    updateComplete: Promise.resolve(true),
  };
  const controller = new NavNotificationsController(stub as never);
  controller.hostConnected();
  return { controller, requestUpdate };
}

describe("nav notifications", () => {
  beforeEach(() => {
    navNotifications.reset();
    localStorage.clear();
    // Seen an older version and an older cosmetics hash: news and store both
    // have something new.
    localStorage.setItem("newsSeenVersion", "v9.9.8");
    localStorage.setItem("storeSeenHash", "hash-1");
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("shares state across components, so dismissing news reveals the store dot", async () => {
    const bell = host();
    const navBar = host();
    // Let the cosmetics-hash fetch settle.
    await Promise.resolve();
    await Promise.resolve();

    // News outranks store, so only the bell shows a dot.
    expect(bell.controller.showNewsDot()).toBe(true);
    expect(navBar.controller.showStoreDot()).toBe(false);

    // Dismissing the bell used to leave the nav bar's own copy of
    // hasNewVersion set, suppressing the store dot until a reload.
    bell.controller.onNewsClick();

    expect(bell.controller.showNewsDot()).toBe(false);
    expect(navBar.controller.showStoreDot()).toBe(true);
    // Both components re-render off the shared state.
    expect(navBar.requestUpdate).toHaveBeenCalled();
  });

  it("keeps help last in the priority chain", async () => {
    const bell = host();
    await Promise.resolve();
    await Promise.resolve();

    expect(bell.controller.showHelpDot()).toBe(false);
    bell.controller.onNewsClick();
    expect(bell.controller.showHelpDot()).toBe(false); // store still pending
    bell.controller.onStoreClick();
    expect(bell.controller.showHelpDot()).toBe(true);
  });

  it("lights the inventory for a new unlock until the inventory is opened", () => {
    const navBar = host();
    const profile = (flares: string[]) =>
      document.dispatchEvent(
        new CustomEvent("userMeResponse", {
          detail: { player: { publicId: "p1", flares } },
        }),
      );

    // The first profile on this device is the baseline, not news.
    profile(["flag:fr", "pattern:*"]);
    expect(navBar.controller.showInventoryDot()).toBe(false);

    profile(["flag:fr", "pattern:*", "crown:couronne_nationale"]);
    expect(navBar.controller.showInventoryDot()).toBe(true);

    navNotifications.onInventoryOpened();
    expect(navBar.controller.showInventoryDot()).toBe(false);
    // Seen for good: the same items after a reload stay quiet.
    navNotifications.reset();
    host();
    profile(["flag:fr", "pattern:*", "crown:couronne_nationale"]);
    expect(navBar.controller.showInventoryDot()).toBe(false);

    // A wildcard grant is not an unlock; signing out clears the dot.
    profile(["flag:fr", "pattern:*", "crown:couronne_nationale", "skin:*"]);
    expect(navBar.controller.showInventoryDot()).toBe(false);
    profile(["flag:fr", "crown:couronne_nationale", "effect:gold"]);
    expect(navBar.controller.showInventoryDot()).toBe(true);
    document.dispatchEvent(
      new CustomEvent("userMeResponse", { detail: false }),
    );
    expect(navBar.controller.showInventoryDot()).toBe(false);
  });
});
