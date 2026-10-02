/**
 * MapSurroundPass — the open sea beyond the map's edges.
 *
 * Draws a large quad around the map (discarding the map rectangle itself) so
 * that zooming out shows the ocean carrying on instead of a flat grey void.
 * It runs before the terrain pass. Impassable tiles inside the map keep the
 * background colour, so they never read as water.
 */

import { createProgram } from "../utils/GlUtils";

import overlayVertSrc from "../shaders/map-overlay/overlay.vert.glsl?raw";
import surroundFragSrc from "../shaders/map-surround/surround.frag.glsl?raw";

/** How far the sea reaches beyond the map, in map spans. */
const REACH = 12;
/** Tiles per cell of the tile mesh drawn on the open sea. */
const CELL_SIZE = 16;
/** The menu's night (--color-ink). */
const NIGHT: readonly [number, number, number] = [6, 16, 12];
/** The terrain pass darkens deep water by up to this much per channel. */
const DEEPEST_WATER_OFFSET = 10;

export class MapSurroundPass {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private buffer: WebGLBuffer;

  private uCamera: WebGLUniformLocation;
  private uMapSize: WebGLUniformLocation;
  private uOceanColor: WebGLUniformLocation;
  private uNightColor: WebGLUniformLocation;
  private uCellSize: WebGLUniformLocation;

  private ocean: [number, number, number];

  constructor(
    gl: WebGL2RenderingContext,
    private mapW: number,
    private mapH: number,
    oceanColor: readonly [number, number, number],
  ) {
    this.gl = gl;
    this.ocean = deepestWater(oceanColor);
    this.program = createProgram(gl, overlayVertSrc, surroundFragSrc);
    this.uCamera = gl.getUniformLocation(this.program, "uCamera")!;
    this.uMapSize = gl.getUniformLocation(this.program, "uMapSize")!;
    this.uOceanColor = gl.getUniformLocation(this.program, "uOceanColor")!;
    this.uNightColor = gl.getUniformLocation(this.program, "uNightColor")!;
    this.uCellSize = gl.getUniformLocation(this.program, "uCellSize")!;

    const span = Math.max(mapW, mapH) * REACH;
    const x0 = -span;
    const y0 = -span;
    const x1 = mapW + span;
    const y1 = mapH + span;
    // prettier-ignore
    const positions = new Float32Array([
      x0, y0, x1, y0, x0, y1,
      x0, y1, x1, y0, x1, y1,
    ]);
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    this.buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  /** Follows a change of the terrain's ocean colour. */
  setOceanColor(oceanColor: readonly [number, number, number]): void {
    this.ocean = deepestWater(oceanColor);
  }

  draw(cameraMatrix: Float32Array): void {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniformMatrix3fv(this.uCamera, false, cameraMatrix);
    gl.uniform2f(this.uMapSize, this.mapW, this.mapH);
    gl.uniform3f(
      this.uOceanColor,
      this.ocean[0] / 255,
      this.ocean[1] / 255,
      this.ocean[2] / 255,
    );
    gl.uniform3f(
      this.uNightColor,
      NIGHT[0] / 255,
      NIGHT[1] / 255,
      NIGHT[2] / 255,
    );
    gl.uniform1f(this.uCellSize, CELL_SIZE);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.program);
    gl.deleteVertexArray(this.vao);
    gl.deleteBuffer(this.buffer);
  }
}

/** The darkest open-water shade the terrain pass bakes for this ocean colour. */
export function deepestWater(
  ocean: readonly [number, number, number],
): [number, number, number] {
  return [
    Math.max(0, ocean[0] - DEEPEST_WATER_OFFSET),
    Math.max(0, ocean[1] - DEEPEST_WATER_OFFSET),
    Math.max(0, ocean[2] - DEEPEST_WATER_OFFSET),
  ];
}
