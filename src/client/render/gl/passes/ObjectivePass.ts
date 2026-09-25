/**
 * ObjectivePass — the map objective zones (see core/game/Objectives.ts).
 *
 * One quad per zone with the shapes drawn in the fragment shader: a tint and
 * an edge ring in the holder's color (white and dashed while nobody holds
 * it), a diamond at the center, and, while someone is taking it, a capture
 * arc in their color that fills clockwise from the top. Strokes keep a
 * minimum screen width so the zones stay readable when zoomed out. There are
 * only a handful of zones, so each is a separate draw with uniforms.
 */

import { createProgram } from "../utils/GlUtils";

import fragSrc from "../shaders/objective/objective.frag.glsl?raw";
import vertSrc from "../shaders/objective/objective.vert.glsl?raw";

export interface ObjectiveZone {
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

export class ObjectivePass {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
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

  private zones: ObjectiveZone[] = [];

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = createProgram(gl, vertSrc, fragSrc);

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
    gl.bindVertexArray(this.vao);

    for (const z of this.zones) {
      // Room for the capture arc and its antialiasing outside the ring.
      const extent =
        z.radius + Math.max(0.6, 1.5 * px) + Math.max(1.4, 4 * px) + 2 * px;
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

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.program);
    gl.deleteVertexArray(this.vao);
  }
}
