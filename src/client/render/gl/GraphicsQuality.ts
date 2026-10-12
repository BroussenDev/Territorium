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
    passEnabled: { fx: false, fallout: false, conquestFlash: false },
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
// screen can show.
const QUALITY_DPR_CAP: Record<GraphicsQuality, number> = {
  low: 1,
  normal: 1.5,
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
