import { GameEvent } from "../../core/EventBus";
import type { PlacementSound } from "./WorldSoundMath";
import { WorldSynth } from "./WorldSynth";

/** Asks for a synthesized placement cue (see WorldSoundController). */
export class PlayWorldPlacementEvent implements GameEvent {
  constructor(public readonly sound: PlacementSound) {}
}

let synth: WorldSynth | null = null;

/**
 * The page's one synthesizer, built on first use because Howler creates its
 * AudioContext lazily. Null when audio is unavailable; callers just skip.
 */
export function worldSynth(): WorldSynth | null {
  synth ??= WorldSynth.create();
  return synth;
}
