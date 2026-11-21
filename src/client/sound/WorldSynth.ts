import { Howler } from "howler";
import {
  AMBIENCE_LAYERS,
  AmbienceLayer,
  LayerLevels,
  PlacementSound,
} from "./WorldSoundMath";

// Every world sound is synthesized here at runtime with the Web Audio API:
// oscillators and filtered noise, no audio files. The graph is spliced into
// Howler's master gain, so the master volume, the limiter and Howler's mute
// all apply without the mixer knowing about this module.

// If updates stop (the game ended), the ambience fades out on its own.
const WATCHDOG_S = 4;

function makeNoise(ctx: AudioContext, seconds: number, brown: boolean) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  let seed = brown ? 7 : 13;
  for (let i = 0; i < length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const white = seed / 2147483648 - 1;
    if (brown) {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else {
      data[i] = white;
    }
  }
  return buffer;
}

// A loop of rail joints: a click-clack about six times a second, each a short
// damped burst, so a passing train needs no per-hit scheduling.
function makeClackLoop(ctx: AudioContext): AudioBuffer {
  const seconds = 3.2;
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 99;
  const step = Math.floor(ctx.sampleRate * 0.16);
  for (let hit = 0; hit * step < length; hit++) {
    const start = hit * step;
    const strong = hit % 2 === 0 ? 1 : 0.6;
    const len = Math.floor(ctx.sampleRate * 0.035);
    for (let i = 0; i < len && start + i < length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const white = seed / 2147483648 - 1;
      const env = Math.exp((-i / len) * 6);
      data[start + i] +=
        strong * env * (0.6 * white + 0.4 * Math.sin(i * 0.35));
    }
  }
  return buffer;
}

export class WorldSynth {
  // Ambience layers sum here, then go to Howler's master gain.
  private readonly bus: GainNode;
  // Placement cues go to Howler's master gain on their own.
  private readonly cueBus: GainNode;
  private readonly layers = new Map<AmbienceLayer, GainNode>();
  private readonly white: AudioBuffer;
  private readonly brown: AudioBuffer;
  private nextGullAt = 0;

  private constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
  ) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(destination);
    this.cueBus = ctx.createGain();
    this.cueBus.connect(destination);
    this.white = makeNoise(ctx, 2, false);
    this.brown = makeNoise(ctx, 4, true);
    this.buildLayers();
  }

  /** Null until Howler has built its AudioContext (first sound loaded). */
  static create(): WorldSynth | null {
    const ctx = Howler.ctx as AudioContext | undefined;
    const master = Howler.masterGain as GainNode | undefined;
    if (!ctx || !master) return null;
    try {
      return new WorldSynth(ctx, master);
    } catch {
      return null;
    }
  }

  private loopSource(buffer: AudioBuffer, rate = 1): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.playbackRate.value = rate;
    src.start();
    return src;
  }

  private lfo(freq: number, depth: number, target: AudioParam): void {
    const osc = this.ctx.createOscillator();
    const amount = this.ctx.createGain();
    osc.frequency.value = freq;
    amount.gain.value = depth;
    osc.connect(amount);
    amount.connect(target);
    osc.start();
  }

  private layerGain(layer: AmbienceLayer): GainNode {
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.bus);
    this.layers.set(layer, gain);
    return gain;
  }

  private buildLayers(): void {
    const ctx = this.ctx;

    // City: a murmur of voices and traffic, swelling and ebbing slowly.
    {
      const out = this.layerGain("city");
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 520;
      band.Q.value = 0.6;
      const swell = ctx.createGain();
      swell.gain.value = 0.7;
      this.lfo(0.17, 0.25, swell.gain);
      this.loopSource(this.white, 0.9).connect(band);
      band.connect(swell);
      swell.connect(out);
    }

    // Port: waves rolling in (a slow swell on low noise); the gulls come from
    // scheduleGull().
    {
      const out = this.layerGain("port");
      const low = ctx.createBiquadFilter();
      low.type = "lowpass";
      low.frequency.value = 650;
      const swell = ctx.createGain();
      swell.gain.value = 0.55;
      this.lfo(0.11, 0.35, swell.gain);
      this.loopSource(this.brown, 1).connect(low);
      low.connect(swell);
      swell.connect(out);
    }

    // Factory: a machine hum (detuned saws under a lowpass) with a faint
    // rattle of noise on top.
    {
      const out = this.layerGain("factory");
      const low = ctx.createBiquadFilter();
      low.type = "lowpass";
      low.frequency.value = 240;
      for (const f of [55, 55.7, 110.3]) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = f;
        const g = ctx.createGain();
        g.gain.value = f > 100 ? 0.12 : 0.22;
        osc.connect(g);
        g.connect(low);
        osc.start();
      }
      const rattle = ctx.createBiquadFilter();
      rattle.type = "bandpass";
      rattle.frequency.value = 1500;
      rattle.Q.value = 2;
      const rattleGain = ctx.createGain();
      rattleGain.gain.value = 0.05;
      this.lfo(3.1, 0.04, rattleGain.gain);
      this.loopSource(this.white, 1.1).connect(rattle);
      rattle.connect(rattleGain);
      rattleGain.connect(out);
      low.connect(out);
    }

    // Rail: a low rumble plus the loop of rail joints.
    {
      const out = this.layerGain("rail");
      const rumble = ctx.createBiquadFilter();
      rumble.type = "lowpass";
      rumble.frequency.value = 180;
      const rumbleGain = ctx.createGain();
      rumbleGain.gain.value = 0.6;
      this.loopSource(this.brown, 0.8).connect(rumble);
      rumble.connect(rumbleGain);
      rumbleGain.connect(out);
      const clackGain = ctx.createGain();
      clackGain.gain.value = 0.35;
      this.loopSource(makeClackLoop(ctx)).connect(clackGain);
      clackGain.connect(out);
    }
  }

  /**
   * Sets the target level of each layer (0-1) and of the whole bus. Cheap
   * enough to call a couple of times a second: parameter automation only, no
   * new nodes (a gull cry is the one rare exception). Each call re-arms a
   * fade-out, so the sound stops by itself if the calls stop.
   */
  setAmbience(levels: LayerLevels, busGain: number, hearable: boolean): void {
    const t = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setTargetAtTime(hearable ? busGain : 0, t, 0.25);
    this.bus.gain.setTargetAtTime(0, t + WATCHDOG_S, 0.5);
    for (const name of AMBIENCE_LAYERS) {
      const gain = this.layers.get(name);
      if (!gain) continue;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setTargetAtTime(levels[name], t, 0.3);
    }
    if (hearable && levels.port > 0.06 && t >= this.nextGullAt) {
      this.scheduleGull(t + 0.05, levels.port);
      this.nextGullAt = t + 5 + ((t * 7919) % 9);
    }
  }

  /** Silences the ambience (setting turned off, tab hidden). */
  silence(): void {
    const t = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setTargetAtTime(0, t, 0.1);
  }

  // A short two- or three-note cry: a soft gull-like glide.
  private scheduleGull(at: number, level: number): void {
    const ctx = this.ctx;
    const notes = 2 + (Math.floor(at * 10) % 2);
    for (let i = 0; i < notes; i++) {
      const start = at + i * 0.22;
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(1500 + i * 80, start);
      osc.frequency.exponentialRampToValueAtTime(1000, start + 0.18);
      env.gain.setValueAtTime(0.0001, start);
      env.gain.exponentialRampToValueAtTime(
        0.05 * Math.min(1, level * 2),
        start + 0.03,
      );
      env.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
      osc.connect(env);
      env.connect(this.bus);
      osc.start(start);
      osc.stop(start + 0.25);
    }
  }

  // ------------------------------------------------------------ placement

  /** Plays the short cue of a placed structure at `level` (0-1). */
  playPlacement(sound: PlacementSound, level: number): void {
    const ctx = this.ctx;
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    this.cueBus.gain.value = Math.max(0, Math.min(1, level));
    const out = this.cueBus;
    const t = ctx.currentTime + 0.01;
    switch (sound) {
      case "city":
        this.tone(out, t, "sine", 659, 659, 0.35, 0.3);
        this.tone(out, t + 0.12, "sine", 880, 880, 0.45, 0.28);
        this.tone(out, t + 0.12, "sine", 1320, 1320, 0.3, 0.1);
        break;
      case "port":
        this.tone(out, t, "sawtooth", 130, 120, 0.7, 0.22, 420);
        this.noise(out, t + 0.1, 0.5, 700, "lowpass", 0.12);
        break;
      case "factory":
        this.noise(out, t, 0.08, 1800, "bandpass", 0.5);
        this.tone(out, t, "square", 190, 150, 0.3, 0.2, 900);
        this.tone(out, t + 0.14, "square", 285, 230, 0.25, 0.15, 900);
        break;
      case "station":
        this.noise(out, t, 0.04, 2400, "bandpass", 0.4);
        this.noise(out, t + 0.11, 0.04, 2400, "bandpass", 0.3);
        this.tone(out, t + 0.22, "sine", 1175, 1175, 0.7, 0.25);
        break;
      case "defense-post":
        this.noise(out, t, 0.07, 500, "lowpass", 0.6);
        this.tone(out, t, "triangle", 110, 70, 0.18, 0.4);
        this.noise(out, t + 0.16, 0.07, 500, "lowpass", 0.45);
        break;
      case "missile-silo":
        this.tone(out, t, "sawtooth", 45, 70, 0.9, 0.3, 160);
        this.noise(out, t + 0.05, 0.06, 1200, "bandpass", 0.35);
        this.tone(out, t + 0.5, "sawtooth", 90, 220, 0.35, 0.12, 600);
        break;
      case "sam":
        this.tone(out, t, "square", 520, 520, 0.08, 0.14, 2500);
        this.tone(out, t + 0.1, "square", 780, 780, 0.08, 0.14, 2500);
        this.tone(out, t + 0.2, "square", 1040, 1040, 0.16, 0.14, 2500);
        break;
      case "radar":
        this.tone(out, t, "sine", 1500, 1400, 0.9, 0.3);
        this.tone(out, t + 0.45, "sine", 1500, 1400, 0.6, 0.15);
        break;
      case "warship":
        this.tone(out, t, "sawtooth", 98, 92, 0.8, 0.22, 320);
        this.tone(out, t + 0.02, "sawtooth", 147, 138, 0.8, 0.1, 320);
        this.noise(out, t + 0.3, 0.5, 900, "lowpass", 0.1);
        break;
    }
  }

  private tone(
    out: AudioNode,
    at: number,
    type: OscillatorType,
    from: number,
    to: number,
    length: number,
    peak: number,
    lowpass?: number,
  ): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    if (to !== from) {
      osc.frequency.exponentialRampToValueAtTime(to, at + length);
    }
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(
      peak,
      at + Math.min(0.02, length / 4),
    );
    env.gain.exponentialRampToValueAtTime(0.0001, at + length);
    let tail: AudioNode = osc;
    if (lowpass !== undefined) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = lowpass;
      osc.connect(f);
      tail = f;
    }
    tail.connect(env);
    env.connect(out);
    osc.start(at);
    osc.stop(at + length + 0.05);
  }

  private noise(
    out: AudioNode,
    at: number,
    length: number,
    freq: number,
    type: BiquadFilterType,
    peak: number,
  ): void {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = 1;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(
      peak,
      at + Math.min(0.01, length / 3),
    );
    env.gain.exponentialRampToValueAtTime(0.0001, at + length);
    src.connect(f);
    f.connect(env);
    env.connect(out);
    src.start(at, 0, length + 0.05);
  }
}
