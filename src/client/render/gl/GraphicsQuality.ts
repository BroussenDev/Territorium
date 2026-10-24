import {
  UserSettings,
  type GraphicsQuality,
} from "../../../core/game/UserSettings";
import type { GraphicsOverrides } from "./GraphicsOverrides";

// What each graphics quality level changes. Independent of the style presets
// (Night, Evan's pick…), so any style plays at any quality. The player's own
// advanced settings are applied after these and always win.
//
// "high" is the game's full look and changes nothing; the levels below it
// drop the effects that cost the most on a weak graphics chip, and render at
// a lower resolution, which divides the pixel work.

const QUALITY_OVERRIDES: Record<GraphicsQuality, GraphicsOverrides> = {
  low: {
    passEnabled: {
      fx: false,
      fallout: false,
      conquestFlash: false,
      trail: false,
    },
    smallPlayerGlow: { strength: 0 },
  },
  normal: {
    passEnabled: { fallout: false },
  },
  high: {},
  ultra: {},
};

// The highest render resolution, as a multiple of the page's CSS pixels.
// Capped at the display's own density: no level renders finer than the
// screen can show. Below 1 the image is drawn smaller and stretched to the
// screen: "low" draws 75 % of the width and height, ~44 % fewer pixels, the
// cost that makes a weak integrated chip drop frames. "normal" stays at the
// page's own pixels, since a 150 % Windows scale would otherwise make it draw
// 2.25 times as many as "low" on the laptops most likely to struggle.
const QUALITY_DPR_CAP: Record<GraphicsQuality, number> = {
  low: 0.75,
  normal: 1,
  high: 2,
  ultra: 3,
};

export function qualityOverrides(quality: GraphicsQuality): GraphicsOverrides {
  return QUALITY_OVERRIDES[quality];
}

export function qualityDprCap(quality: GraphicsQuality): number {
  return QUALITY_DPR_CAP[quality];
}

const settings = new UserSettings();

/** The player's current graphics quality. */
export function currentGraphicsQuality(): GraphicsQuality {
  return settings.graphicsQuality();
}
