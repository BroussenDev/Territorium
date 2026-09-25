/**
 * ObjectivePass — the map objective zones (see core/game/Objectives.ts).
 *
 * One quad per zone with the shapes drawn in the fragment shader: a tint and
 * an edge ring in the holder's color (gold and dashed while nobody holds it),
 * a diamond at the center, and, while someone is taking it, a capture arc in
 * their color that fills clockwise from the top. Strokes keep a minimum
 * screen width so the zones stay readable when zoomed out. There are only a
 * handful of zones, so each is a separate draw with uniforms.
 *
 * Each zone also gets a gold name label above it ("◆ Objective A"), drawn at
 * a constant screen size on top of player names. While the highlight is on
 * (the first minutes of a game, set by WebGLFrameBuilder) the zones send out
 * a gold ping and the label is bigger, with the bonus underneath.
 */

import {
  OBJECTIVE_GOLD_PER_TICK,
  OBJECTIVE_TROOP_GROWTH_PERCENT,
} from "../../../../core/game/Objectives";
import { translateText } from "../../../Utils";
import { renderDpr } from "../utils/Dpr";
import { createProgram } from "../utils/GlUtils";

import labelFragSrc from "../shaders/objective/objective-label.frag.glsl?raw";
import labelVertSrc from "../shaders/objective/objective-label.vert.glsl?raw";
import fragSrc from "../shaders/objective/objective.frag.glsl?raw";
import vertSrc from "../shaders/objective/objective.vert.glsl?raw";

export interface ObjectiveZone {
  id: number;
  x: number;
  y: number;
  radius: number;
  /** Holder color, 0..1 per channel; null when nobody holds the zone. */
  holder: [number, number, number] | null;
  /** Color of the side taking the zone. */
  capturer: [number, number, number];
  /** Capture progress, 0..1. */
  progress: number;
}

interface Label {
  tex: WebGLTexture;
  /** Texture size over the font size it was drawn at. */
  aspectW: number;
  aspectH: number;
}

// Label textures are drawn once at this font size and scaled down on screen.
const LABEL_FONT_PX = 48;
const LABEL_OUTLINE_PX = 8;
const TITLE_COLOR: [number, number, number] = [1.0, 0.8, 0.25];
const SUBTITLE_COLOR: [number, number, number] = [1.0, 0.93, 0.75];
// On-screen font sizes in CSS pixels, without and with the highlight.
const TITLE_PX = 13;
const TITLE_HIGHLIGHT_PX = 19;
const SUBTITLE_PX = 13;
/** Screen pixels between the zone's arc and its label. */
const LABEL_GAP_PX = 4;

export class ObjectivePass {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private labelProgram: WebGLProgram;
  private vao: WebGLVertexArrayObject;

  private uCamera: WebGLUniformLocation;
  private uCenter: WebGLUniformLocation;
  private uExtent: WebGLUniformLocation;
  private uRadius: WebGLUniformLocation;
  private uPx: WebGLUniformLocation;
  private uHolderColor: WebGLUniformLocation;
  private uHeld: WebGLUniformLocation;
  private uCapColor: WebGLUniformLocation;
  private uProgress: WebGLUniformLocation;
  private uTime: WebGLUniformLocation;
  private uHighlight: WebGLUniformLocation;

  private lCamera: WebGLUniformLocation;
  private lAnchor: WebGLUniformLocation;
  private lOffset: WebGLUniformLocation;
  private lSize: WebGLUniformLocation;
  private lViewport: WebGLUniformLocation;
  private lColor: WebGLUniformLocation;
  private lAlpha: WebGLUniformLocation;

  private zones: ObjectiveZone[] = [];
  private highlight = 0;
  /** Label textures by text, so a language change just adds new ones. */
  private labels = new Map<string, Label>();
  private titles: string[] = [];
  private subtitle = "";

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = createProgram(gl, vertSrc, fragSrc);
    this.labelProgram = createProgram(gl, labelVertSrc, labelFragSrc);

    const loc = (name: string) => gl.getUniformLocation(this.program, name)!;
    this.uCamera = loc("uCamera");
    this.uCenter = loc("uCenter");
    this.uExtent = loc("uExtent");
    this.uRadius = loc("uRadius");
    this.uPx = loc("uPx");
    this.uHolderColor = loc("uHolderColor");
    this.uHeld = loc("uHeld");
    this.uCapColor = loc("uCapColor");
    this.uProgress = loc("uProgress");
    this.uTime = loc("uTime");
    this.uHighlight = loc("uHighlight");

    const lloc = (name: string) =>
      gl.getUniformLocation(this.labelProgram, name)!;
    this.lCamera = lloc("uCamera");
    this.lAnchor = lloc("uAnchor");
    this.lOffset = lloc("uOffsetPx");
    this.lSize = lloc("uSizePx");
    this.lViewport = lloc("uViewport");
    this.lColor = lloc("uColor");
    this.lAlpha = lloc("uAlpha");
    gl.useProgram(this.labelProgram);
    gl.uniform1i(lloc("uTex"), 0);

    // Unit quad [0,1]
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const quadBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  update(zones: ObjectiveZone[]): void {
    this.zones = zones;
    this.titles = zones.map(
      (z) =>
        `◆ ${translateText("objectives.zone_label", {
          letter: String.fromCharCode(65 + (z.id % 26)),
        })}`,
    );
    this.subtitle = translateText("objectives.bonus", {
      gold: Number(OBJECTIVE_GOLD_PER_TICK),
      troops: OBJECTIVE_TROOP_GROWTH_PERCENT,
    });
  }

  /** 1 while the zones should stand out (start of the game), 0 after. */
  setHighlight(highlight: number): void {
    this.highlight = highlight;
  }

  /** `zoom` is screen pixels per tile. */
  draw(cameraMatrix: Float32Array, zoom: number): void {
    if (this.zones.length === 0) return;

    const gl = this.gl;
    const px = 1 / Math.max(zoom, 1e-3);
    gl.useProgram(this.program);
    gl.uniformMatrix3fv(this.uCamera, false, cameraMatrix);
    gl.uniform1f(this.uPx, px);
    gl.uniform1f(this.uTime, performance.now() / 1000);
    gl.uniform1f(this.uHighlight, this.highlight);
    gl.bindVertexArray(this.vao);

    for (const z of this.zones) {
      // Room for the capture arc and its antialiasing outside the ring, and
      // for the ping while highlighted (must match objective.frag.glsl).
      let extent =
        z.radius + Math.max(0.6, 1.5 * px) + Math.max(1.4, 4 * px) + 2 * px;
      if (this.highlight > 0) {
        extent = Math.max(
          extent,
          z.radius + Math.max(z.radius * 0.8, 28 * px) + 4 * px,
        );
      }
      gl.uniform2f(this.uCenter, z.x, z.y);
      gl.uniform1f(this.uExtent, extent);
      gl.uniform1f(this.uRadius, z.radius);
      const holder = z.holder ?? [1, 1, 1];
      gl.uniform3f(this.uHolderColor, holder[0], holder[1], holder[2]);
      gl.uniform1f(this.uHeld, z.holder === null ? 0 : 1);
      gl.uniform3f(this.uCapColor, z.capturer[0], z.capturer[1], z.capturer[2]);
      gl.uniform1f(this.uProgress, z.progress);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    gl.bindVertexArray(null);
  }

  /** The zone names; drawn after player names so they stay on top. */
  drawLabels(cameraMatrix: Float32Array, zoom: number): void {
    if (this.zones.length === 0) return;

    const gl = this.gl;
    const px = 1 / Math.max(zoom, 1e-3);
    const dpr = renderDpr();
    const h = this.highlight;
    const pulse = 1 + 0.05 * h * Math.sin((performance.now() / 1000) * Math.PI);
    const titlePx = (TITLE_PX + (TITLE_HIGHLIGHT_PX - TITLE_PX) * h) * pulse;

    gl.useProgram(this.labelProgram);
    gl.uniformMatrix3fv(this.lCamera, false, cameraMatrix);
    gl.uniform2f(this.lViewport, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(this.vao);

    const subtitle = h > 0 ? this.label(this.subtitle) : null;
    this.zones.forEach((z, i) => {
      // Just above the ring and its capture arc.
      const top = z.y + 0.5 - z.radius - Math.max(2, 5 * px);
      gl.uniform2f(this.lAnchor, z.x + 0.5, top);
      let offset = LABEL_GAP_PX * dpr;
      if (subtitle !== null) {
        offset +=
          this.drawLabel(
            subtitle,
            SUBTITLE_PX * dpr,
            offset,
            SUBTITLE_COLOR,
            h,
          ) * h;
      }
      const title = this.titles[i];
      if (title !== undefined) {
        this.drawLabel(
          this.label(title),
          titlePx * dpr,
          offset,
          TITLE_COLOR,
          1,
        );
      }
    });
    gl.bindVertexArray(null);
  }

  /**
   * Draws a label with its bottom center `offsetPx` device pixels above the
   * anchor. Returns its height in device pixels.
   */
  private drawLabel(
    label: Label,
    fontPx: number,
    offsetPx: number,
    color: [number, number, number],
    alpha: number,
  ): number {
    const gl = this.gl;
    const w = label.aspectW * fontPx;
    const hgt = label.aspectH * fontPx;
    gl.bindTexture(gl.TEXTURE_2D, label.tex);
    gl.uniform2f(this.lOffset, 0, offsetPx);
    gl.uniform2f(this.lSize, w, hgt);
    gl.uniform3f(this.lColor, color[0], color[1], color[2]);
    gl.uniform1f(this.lAlpha, alpha);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    return hgt;
  }

  /**
   * The label texture for `text`: white glyphs on a dark outline, so the
   * shader can tint the fill and keep the outline. Drawn with the page's
   * font, which covers every language.
   */
  private label(text: string): Label {
    const cached = this.labels.get(text);
    if (cached !== undefined) return cached;

    const font = `700 ${LABEL_FONT_PX}px ${getComputedStyle(document.body).fontFamily || "sans-serif"}`;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    ctx.font = font;
    const pad = LABEL_OUTLINE_PX;
    canvas.width = Math.ceil(ctx.measureText(text).width + pad * 2);
    canvas.height = Math.ceil(LABEL_FONT_PX * 1.3 + pad * 2);
    // Resizing the canvas resets its state.
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = LABEL_OUTLINE_PX;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
    ctx.fillStyle = "white";
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    ctx.strokeText(text, cx, cy);
    ctx.fillText(text, cx, cy);

    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const label = {
      tex,
      aspectW: canvas.width / LABEL_FONT_PX,
      aspectH: canvas.height / LABEL_FONT_PX,
    };
    this.labels.set(text, label);
    return label;
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.program);
    gl.deleteProgram(this.labelProgram);
    gl.deleteVertexArray(this.vao);
    for (const label of this.labels.values()) gl.deleteTexture(label.tex);
    this.labels.clear();
  }
}
