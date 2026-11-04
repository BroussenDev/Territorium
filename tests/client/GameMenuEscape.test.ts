import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { escapeOpensMenu } from "../../src/client/GameMenuKey";
import {
  CloseViewEvent,
  InputHandler,
  ToggleGameMenuEvent,
} from "../../src/client/InputHandler";
import type { GameView } from "../../src/client/view";
import { EventBus } from "../../src/core/EventBus";
import { KEYBINDS_KEY, UserSettings } from "../../src/core/game/UserSettings";

describe("escapeOpensMenu", () => {
  const press = {
    menuKey: "Escape" as string | undefined,
    fromTextInput: false,
    closedSomething: false,
    viewHandled: false,
  };

  it("opens the menu when Escape had nothing to close", () => {
    expect(escapeOpensMenu(press)).toBe(true);
  });

  it("leaves the key to whatever it closed", () => {
    expect(escapeOpensMenu({ ...press, closedSomething: true })).toBe(false);
    expect(escapeOpensMenu({ ...press, viewHandled: true })).toBe(false);
  });

  it("does not open the menu from a text field, or when Escape is unbound", () => {
    expect(escapeOpensMenu({ ...press, fromTextInput: true })).toBe(false);
    expect(escapeOpensMenu({ ...press, menuKey: "KeyM" })).toBe(false);
    expect(escapeOpensMenu({ ...press, menuKey: undefined })).toBe(false);
  });
});

describe("Escape in a game", () => {
  let inputHandler: InputHandler;
  let eventBus: EventBus;
  let emitted: unknown[];
  let uiState: {
    attackRatio: number;
    ghostStructure: unknown;
    rocketDirectionUp: boolean;
    upgradeMultiplier: number;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    new UserSettings().removeCached(KEYBINDS_KEY, false);
    document.body.innerHTML = "";
    const gameView = {
      inSpawnPhase: () => false,
      myPlayer: () => ({ isAlive: () => true }),
    } as unknown as GameView;
    eventBus = new EventBus();
    emitted = [];
    const realEmit = eventBus.emit.bind(eventBus);
    vi.spyOn(eventBus, "emit").mockImplementation((e) => {
      emitted.push(e);
      realEmit(e);
    });
    uiState = {
      attackRatio: 20,
      ghostStructure: null,
      rocketDirectionUp: true,
      upgradeMultiplier: 1,
    };
    inputHandler = new InputHandler(
      gameView,
      uiState as never,
      document.createElement("canvas"),
      eventBus,
    );
    inputHandler.initialize();
  });

  afterEach(() => {
    inputHandler.destroy();
    new UserSettings().removeCached(KEYBINDS_KEY, false);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function escape(target: EventTarget = document.body) {
    const event = new KeyboardEvent("keydown", {
      code: "Escape",
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
    vi.advanceTimersByTime(5);
    return event;
  }

  const menuToggles = () =>
    emitted.filter((e) => e instanceof ToggleGameMenuEvent);

  it("opens the menu when nothing else takes the key", () => {
    escape();
    expect(menuToggles()).toHaveLength(1);
  });

  it("closes a menu or card first and does not open the game menu", () => {
    eventBus.on(CloseViewEvent, (e) => {
      e.handled = true;
    });
    escape();
    expect(menuToggles()).toHaveLength(0);
  });

  it("cancels a build preview first", () => {
    uiState.ghostStructure = "City";
    escape();
    expect(uiState.ghostStructure).toBeNull();
    expect(menuToggles()).toHaveLength(0);
    // The next press, with nothing left to cancel, opens the menu.
    escape();
    expect(menuToggles()).toHaveLength(1);
  });

  it("leaves the key to a window that handled it on the same press", () => {
    const window1 = (e: KeyboardEvent) => {
      if (e.key === "Escape") e.preventDefault();
    };
    // Registered after the input handler, so it runs after it: still counts.
    window.addEventListener("keydown", window1);
    escape();
    window.removeEventListener("keydown", window1);
    expect(menuToggles()).toHaveLength(0);
  });

  it("does not open the menu from a text field", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    escape(input);
    expect(menuToggles()).toHaveLength(0);
  });

  it("does not open the menu when the key is rebound", () => {
    new UserSettings().setKeybinds({ gameMenu: { value: "KeyM", key: "M" } });
    escape();
    expect(menuToggles()).toHaveLength(0);
    document.body.dispatchEvent(
      new KeyboardEvent("keyup", { code: "KeyM", key: "m", bubbles: true }),
    );
    expect(menuToggles()).toHaveLength(1);
  });
});
