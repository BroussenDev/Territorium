import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { crazyGamesSDK } from "../../src/client/CrazyGamesSDK";
import "../../src/client/hud/layers/SettingsModal";
import type { SettingsModal } from "../../src/client/hud/layers/SettingsModal";
import { EventBus } from "../../src/core/EventBus";

type TestMenu = SettingsModal & { updateComplete: Promise<unknown> };

describe("in-game menu window", () => {
  let menu: TestMenu;

  beforeEach(async () => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
    vi.spyOn(crazyGamesSDK, "gameplayStop").mockImplementation(async () => {});
    vi.spyOn(crazyGamesSDK, "gameplayStart").mockImplementation(async () => {});
    menu = document.createElement("settings-modal") as TestMenu;
    document.body.appendChild(menu);
    menu.eventBus = new EventBus();
    menu.init();
    menu.openModal();
    await menu.updateComplete;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("groups its rows and sets exiting apart as the danger action", () => {
    expect(menu.querySelector('[role="dialog"]')).not.toBeNull();
    expect(menu.querySelectorAll("section")).toHaveLength(3);
    const exit = menu.querySelector("[data-exit-game]")!;
    expect(exit.className).toContain("red");
    // Icons are drawn SVG, not images or emoji.
    expect(menu.querySelectorAll("svg").length).toBeGreaterThanOrEqual(6);
    expect(menu.querySelector("img")).toBeNull();
  });

  it("claims Escape when it closes, so the game does not reopen it", async () => {
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(menu.isOpen).toBe(false);
  });

  it("fades out before it leaves the page, and reopens cleanly", async () => {
    menu.closeModal();
    await menu.updateComplete;
    const overlay = menu.querySelector(".modal-overlay");
    expect(overlay).not.toBeNull();
    expect(overlay!.hasAttribute("data-closing")).toBe(true);

    vi.advanceTimersByTime(300);
    await menu.updateComplete;
    expect(menu.querySelector(".modal-overlay")).toBeNull();

    menu.openModal();
    await menu.updateComplete;
    expect(
      menu.querySelector(".modal-overlay")!.hasAttribute("data-closing"),
    ).toBe(false);
  });

  it("hands over to the settings without a fade", async () => {
    menu.closeModal({ keepPause: true });
    await menu.updateComplete;
    expect(menu.querySelector(".modal-overlay")).toBeNull();
  });

  it("walks the rows with the arrow keys and keeps Tab inside", async () => {
    const rows = [...menu.querySelectorAll<HTMLElement>("button")];
    rows[0].focus();
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", cancelable: true }),
    );
    expect(document.activeElement).toBe(rows[1]);

    const last = rows[rows.length - 1];
    last.focus();
    const tab = new KeyboardEvent("keydown", { key: "Tab", cancelable: true });
    window.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(rows[0]);
  });

  it("is a switch for the terrain view", async () => {
    const terrain = menu.querySelector('[role="switch"]') as HTMLElement;
    expect(terrain.getAttribute("aria-checked")).toBe("false");
    terrain.click();
    await menu.updateComplete;
    expect(
      (menu.querySelector('[role="switch"]') as HTMLElement).getAttribute(
        "aria-checked",
      ),
    ).toBe("true");
  });
});
