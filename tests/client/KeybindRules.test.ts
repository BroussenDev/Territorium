import { describe, expect, it } from "vitest";
import { keybindConflicts } from "../../src/client/KeybindRules";
import { getDefaultKeybinds } from "../../src/core/game/UserSettings";

const defaults = getDefaultKeybinds(false);

describe("keybindConflicts", () => {
  it("refuses a key another action uses by default", () => {
    expect(keybindConflicts(defaults, {}, "zoomIn", "KeyQ")).toBe(true);
  });

  it("accepts a free key, and the action's own key", () => {
    expect(keybindConflicts(defaults, {}, "zoomIn", "KeyJ")).toBe(false);
    expect(keybindConflicts(defaults, {}, "zoomIn", "KeyE")).toBe(false);
  });

  it("frees a key once its action is rebound or unbound", () => {
    expect(
      keybindConflicts(
        defaults,
        { zoomOut: { value: "KeyJ", key: "j" } },
        "zoomIn",
        "KeyQ",
      ),
    ).toBe(false);
    expect(
      keybindConflicts(
        defaults,
        { zoomOut: { value: "Null", key: "" } },
        "zoomIn",
        "KeyQ",
      ),
    ).toBe(false);
  });

  it("never treats unbinding as a conflict", () => {
    expect(keybindConflicts(defaults, {}, "zoomIn", "Null")).toBe(false);
  });

  it("lets the paired modifiers share their key", () => {
    expect(keybindConflicts(defaults, {}, "emojiMenuModifier", "AltLeft")).toBe(
      false,
    );
    expect(keybindConflicts(defaults, {}, "zoomIn", "AltLeft")).toBe(true);
  });
});
