/**
 * CapitalShieldPass — Nations mode: the blue barrier around each capital
 * while its surrounding land can't be taken or bombed (first minute).
 *
 * One quad per capital with a circle SDF in the fragment shader: a faint
 * dome with a hex lattice and a bright rim. `uStrength` fades it out as the
 * shield ends.
 */

import { createProgram } from "../utils/GlUtils";

import fragSrc from "../shaders/capital-shield/capital-shield.frag.glsl?raw";
import vertSrc from "../shaders/capital-shield/capital-shield.vert.glsl?raw";

export interface CapitalShieldState {
  /** Capital tiles as [x0, y0, x1, y1, ...]. */
  centers: number[];
  /** Shield radius in tiles. */
  radius: number;
  /** 0..1 — how strongly to draw the shield. */
  strength: number;
}

export class CapitalShieldPass {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;

  private uCamera: WebGLUniformLocation;
  private uCenter: WebGLUniformLocation;
  private uRadius: WebGLUniformLocation;
  private uTime: WebGLUniformLocation;
  private uStrength: WebGLUniformLocation;

  private state: CapitalShieldState | null = null;
  private startTime = performance.now();

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = createProgram(gl, vertSrc, fragSrc);

    this.uCamera = gl.getUniformLocation(this.program, "uCamera")!;
    this.uCenter = gl.getUniformLocation(this.program, "uCenter")!;
    this.uRadius = gl.getUniformLocation(this.program, "uRadius")!;
    this.uTime = gl.getUniformLocation(this.program, "uTime")!;
    this.uStrength = gl.getUniformLocation(this.program, "uStrength")!;

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

  /** Null (or no centers) hides the shields. */
  update(state: CapitalShieldState | null): void {
    this.state =
      state !== null && state.centers.length > 0 && state.strength > 0
        ? state
        : null;
  }

  draw(cameraMatrix: Float32Array): void {
    const state = this.state;
    if (state === null) return;

    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniformMatrix3fv(this.uCamera, false, cameraMatrix);
    gl.uniform1f(this.uRadius, state.radius);
    gl.uniform1f(this.uTime, (performance.now() - this.startTime) / 1000);
    gl.uniform1f(this.uStrength, state.strength);
    gl.bindVertexArray(this.vao);
    for (let i = 0; i + 1 < state.centers.length; i += 2) {
      gl.uniform2f(this.uCenter, state.centers[i], state.centers[i + 1]);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.program);
    gl.deleteVertexArray(this.vao);
  }
}
