import {
  GRAPHICS_QUALITIES,
  type GraphicsQuality,
} from "../../../core/game/UserSettings";
import { qualityDprCap } from "./GraphicsQuality";

/**
 * A short test of the graphics chip, to recommend a graphics quality.
 *
 * It draws a scene shaped like the map (relief, coloured territories, their
 * borders, a light) over and over, timing the GPU's actual work with
 * gl.finish() rather than counting animation frames: frames are held to the
 * display's refresh rate, so a fast and a very fast chip would both read 60.
 *
 * The measured cost per pixel is then applied to the screen's real size at
 * each quality's resolution, with the number of passes a map frame draws, to
 * estimate the frames per second of each level in a game. It is an estimate:
 * the in-game watch (QualitySuggestion) corrects it with the real thing.
 */

// Full-screen passes a map frame draws at each quality (terrain,
// territories, borders, light, units and effects), counted as passes of
// this test's cost: the lower levels turn some effects off.
const PASSES_PER_FRAME: Record<GraphicsQuality, number> = {
  low: 4,
  normal: 5.5,
  high: 6,
  ultra: 6,
};
// What a frame costs beyond the pixels: the simulation's updates, the HUD.
const FRAME_OVERHEAD_MS = 2;
// Frames per second a quality must reach to be recommended.
export const TARGET_FPS = 55;
// How long the test draws, in ms.
export const BENCHMARK_MS = 2500;

export interface BenchmarkResult {
  /** Estimated frames per second in a game, per quality. */
  fps: Record<GraphicsQuality, number>;
  /** The best quality expected to hold TARGET_FPS ("low" at worst). */
  recommended: GraphicsQuality;
  /** The graphics chip, as the browser names it. */
  renderer: string;
  /** True when no hardware acceleration is available. */
  software: boolean;
}

/**
 * The best quality whose estimate holds the target ("low" at worst). Ultra
 * only differs from High on a screen denser than High renders: elsewhere it
 * is not offered as the recommendation, which would only suggest the
 * player needs it.
 */
export function recommendQuality(
  fps: Record<GraphicsQuality, number>,
  devicePixelRatio: number,
): GraphicsQuality {
  let best: GraphicsQuality = "low";
  for (const quality of GRAPHICS_QUALITIES) {
    if (quality === "ultra" && devicePixelRatio <= qualityDprCap("high")) {
      continue;
    }
    if (fps[quality] >= TARGET_FPS) best = quality;
  }
  return best;
}

/**
 * The graphics chip's name as a player knows it: browsers on Windows wrap it
 * as "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002503) Direct3D11 …)".
 */
export function chipName(renderer: string): string {
  const angle = /^ANGLE \((.*)\)$/.exec(renderer.trim());
  if (angle === null) return renderer.trim();
  const parts = angle[1].split(", ");
  const name = parts.length > 1 ? parts[1] : parts[0];
  return name
    .replace(/\s*\(0x[0-9a-f]+\)/i, "")
    .replace(/\s+(Direct3D|OpenGL|Vulkan|Metal).*$/i, "")
    .trim();
}

/**
 * Frames per second of each quality on this screen, from the GPU time one
 * pass took per million pixels.
 */
export function estimateFps(
  msPerMegapixel: number,
  screenCssPixels: number,
  devicePixelRatio: number,
): Record<GraphicsQuality, number> {
  const out = {} as Record<GraphicsQuality, number>;
  for (const quality of GRAPHICS_QUALITIES) {
    const dpr = Math.min(devicePixelRatio, qualityDprCap(quality));
    const megapixels = (screenCssPixels * dpr * dpr) / 1_000_000;
    const frameMs =
      FRAME_OVERHEAD_MS +
      msPerMegapixel * megapixels * PASSES_PER_FRAME[quality];
    out[quality] = Math.round(1000 / frameMs);
  }
  return out;
}

const VERTEX = `#version 300 es
in vec2 p;
out vec2 uv;
void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

// Relief from layered noise, territories from cells, their borders, and a
// moving light: roughly the per-pixel work of the map's passes.
const FRAGMENT = `#version 300 es
precision highp float;
in vec2 uv;
uniform float t;
uniform vec2 res;
out vec4 color;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  vec2 p = uv * vec2(res.x / res.y, 1.0) * 6.0;
  float h = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { h += a * noise(p); p *= 2.03; a *= 0.5; }
  vec2 cell = floor(uv * 14.0 + vec2(t * 0.05, 0.0));
  float owner = hash(cell);
  vec2 f = fract(uv * 14.0 + vec2(t * 0.05, 0.0));
  float border = smoothstep(0.0, 0.06, min(min(f.x, f.y), min(1.0 - f.x, 1.0 - f.y)));
  vec3 land = mix(vec3(0.20, 0.42, 0.24), vec3(0.62, 0.58, 0.44), h);
  vec3 sea = vec3(0.10, 0.25, 0.42);
  vec3 base = h > 0.45 ? land : sea;
  vec3 team = vec3(0.5 + 0.5 * sin(owner * 6.28 + vec3(0.0, 2.1, 4.2)));
  vec3 c = mix(base, team, h > 0.45 ? 0.45 : 0.0);
  c *= mix(0.35, 1.0, border);
  float light = 0.6 + 0.4 * sin(uv.x * 9.0 + t) * cos(uv.y * 7.0 - t * 0.7);
  color = vec4(c * light, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  return shader;
}

/**
 * Runs the test on `canvas` (shown to the player while it runs), calling
 * `progress` with 0..1. Resolves with the estimate, or a "low" result when
 * WebGL2 is unavailable.
 */
export async function runGraphicsBenchmark(
  canvas: HTMLCanvasElement,
  progress: (done: number) => void = () => {},
  screen = { width: window.innerWidth, height: window.innerHeight },
  devicePixelRatio = window.devicePixelRatio || 1,
): Promise<BenchmarkResult> {
  const lowest: BenchmarkResult = {
    fps: { low: 0, normal: 0, high: 0, ultra: 0 },
    recommended: "low",
    renderer: "",
    software: true,
  };
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    powerPreference: "high-performance",
  });
  if (gl === null) return lowest;

  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = dbg
    ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
    : String(gl.getParameter(gl.RENDERER));
  const software = /swiftshader|llvmpipe|software|basic render/i.test(renderer);

  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return lowest;
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const loc = gl.getAttribLocation(program, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uTime = gl.getUniformLocation(program, "t");
  const uRes = gl.getUniformLocation(program, "res");

  // The test draws at the canvas's own backing size: the preview's.
  const width = canvas.width;
  const height = canvas.height;
  gl.viewport(0, 0, width, height);
  gl.uniform2f(uRes, width, height);

  // One warm-up pass: the first draw also compiles and uploads.
  gl.uniform1f(uTime, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.finish();

  const megapixels = (width * height) / 1_000_000;
  const timings: number[] = [];
  const start = performance.now();
  const passesPerFrame = 4;
  await new Promise<void>((resolve) => {
    const frame = () => {
      const now = performance.now();
      const elapsed = now - start;
      gl.uniform1f(uTime, elapsed / 1000);
      const t0 = performance.now();
      for (let i = 0; i < passesPerFrame; i++) {
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      gl.finish();
      timings.push((performance.now() - t0) / passesPerFrame / megapixels);
      progress(Math.min(1, elapsed / BENCHMARK_MS));
      if (elapsed >= BENCHMARK_MS) resolve();
      else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });

  // The last frame stays on the canvas; what drew it can go.
  gl.deleteBuffer(buffer);
  gl.deleteProgram(program);

  // The median pass: one hiccup (a tab switch, a GC) must not decide it.
  const sorted = [...timings].sort((a, b) => a - b);
  const msPerMegapixel = sorted[Math.floor(sorted.length / 2)] ?? Infinity;
  const fps = estimateFps(
    msPerMegapixel,
    screen.width * screen.height,
    devicePixelRatio,
  );
  return {
    fps,
    recommended: software ? "low" : recommendQuality(fps, devicePixelRatio),
    renderer,
    software,
  };
}
