import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { qualityOverrides } from "../../src/client/render/gl/GraphicsQuality";
import { applyGraphicsOverrides } from "../../src/client/render/gl/RenderOverrides";
import { createRenderSettings } from "../../src/client/render/gl/RenderSettings";
import { renderDpr } from "../../src/client/render/gl/utils/Dpr";
import {
  GRAPHICS_QUALITIES,
  UserSettings,
} from "../../src/core/game/UserSettings";

function clearSettings() {
  localStorage.clear();
  (UserSettings as unknown as { cache: Map<string, unknown> }).cache.clear();
}

describe("graphics quality", () => {
  const realDpr = window.devicePixelRatio;

  beforeEach(clearSettings);
  afterEach(() => {
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: realDpr,
    });
    clearSettings();
  });

  function dprAt(quality: (typeof GRAPHICS_QUALITIES)[number], screen: number) {
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: screen,
    });
    new UserSettings().setGraphicsQuality(quality);
    return renderDpr();
  }

  it("defaults to high, the game's full look", () => {
    expect(new UserSettings().graphicsQuality()).toBe("high");
    expect(qualityOverrides("high")).toEqual({});
  });

  it("renders at each level's resolution on a dense screen", () => {
    expect(dprAt("low", 3)).toBe(1);
    expect(dprAt("normal", 3)).toBe(1.5);
    expect(dprAt("high", 3)).toBe(2);
    expect(dprAt("ultra", 3)).toBe(3);
  });

  it("never renders finer than the screen", () => {
    expect(dprAt("ultra", 1)).toBe(1);
  });

  it("turns the costly effects off at low", () => {
    const settings = createRenderSettings();
    applyGraphicsOverrides(settings, qualityOverrides("low"));
    expect(settings.passEnabled.fx).toBe(false);
    expect(settings.passEnabled.conquestFlash).toBe(false);
    expect(settings.passEnabled.falloutBloom).toBe(false);
  });

  // The quality level is applied first, so the player's own advanced
  // settings always have the last word.
  it("lets the player's own settings win over the level", () => {
    const settings = createRenderSettings();
    applyGraphicsOverrides(settings, qualityOverrides("low"));
    applyGraphicsOverrides(settings, { passEnabled: { fx: true } });
    expect(settings.passEnabled.fx).toBe(true);
  });

  it("refuses a level it does not offer", () => {
    const settings = new UserSettings();
    settings.setGraphicsQuality("ultra");
    settings.setGraphicsQuality("cinematic" as never);
    expect(settings.graphicsQuality()).toBe("ultra");
  });
});
