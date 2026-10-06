import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatKeyForDisplay,
  KEYBOARD_LAYOUT_READY_EVENT,
  loadKeyboardLayout,
} from "../../src/client/Utils";

function withKeyboard(keyboard: unknown) {
  Object.defineProperty(navigator, "keyboard", {
    value: keyboard,
    configurable: true,
  });
}

// What Chromium reports for a French AZERTY keyboard.
const AZERTY = new Map([
  ["KeyW", "z"],
  ["KeyA", "q"],
  ["KeyQ", "a"],
  ["KeyZ", "w"],
  ["KeyS", "s"],
  ["KeyM", ","],
  ["Digit1", "&"],
]);

afterEach(() => {
  withKeyboard(undefined);
});

describe("formatKeyForDisplay with the player's keyboard", () => {
  it("shows the letters an AZERTY keyboard prints once the layout is read", async () => {
    const ready = vi.fn();
    window.addEventListener(KEYBOARD_LAYOUT_READY_EVENT, ready);
    withKeyboard({ getLayoutMap: async () => AZERTY });
    await loadKeyboardLayout();
    window.removeEventListener(KEYBOARD_LAYOUT_READY_EVENT, ready);

    expect(ready).toHaveBeenCalledOnce();
    expect(
      ["KeyW", "KeyA", "KeyS", "KeyQ", "KeyZ"].map(formatKeyForDisplay),
    ).toEqual(["Z", "Q", "S", "A", "W"]);
    expect(formatKeyForDisplay("Shift+KeyA")).toBe("Shift+Q");
    // Digits keep their number, and a key that prints no letter its name.
    expect(formatKeyForDisplay("Digit1")).toBe("1");
    expect(formatKeyForDisplay("KeyM")).toBe("M");
  });

  it("keeps a layout it cannot read silent", async () => {
    withKeyboard({
      getLayoutMap: async () => {
        throw new Error("not allowed");
      },
    });
    await expect(loadKeyboardLayout()).resolves.toBeUndefined();
  });
});
