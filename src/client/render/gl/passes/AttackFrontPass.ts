/**
 * AttackFrontPass — the local player's land fronts.
 *
 * A map-quad overlay that reads the tile owner texture and a 1024×1 table of
 * front flags (see derive/AttackFronts) and draws a thin pulsing line on each
 * border where the player is fighting, with chevrons showing which way the
 * attack goes: emerald for the player's attacks, red for attacks on them.
 * Fragments away from those borders are discarded after one or two fetches.
 */

import { ATTACK_FRONT_SIZE } from "../../frame/derive/AttackFronts";
import attackFrontFragSrc from "../shaders/attack-front/attack-front.frag.glsl?raw";
import overlayVertSrc from "../shaders/map-overlay/overlay.vert.glsl?raw";
import {
  createMapQuad,
  createProgram,
  createTexture2D,
  shaderSrc,
} from "../utils/GlUtils";
import { TILE_DEFINES } from "../utils/TileCodec";

/** Emerald (the player's attacks) and red (attacks on the player). */
const OUTGOING_COLOR: readonly [number, number, number] = [52, 211, 153];
const INCOMING_COLOR: readonly [number, number, number] = [239, 68, 68];

export class AttackFrontPass {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private frontTex: WebGLTexture;

  private uCamera: WebGLUniformLocation;
  private uMapSize: WebGLUniformLocation;
  private uMe: WebGLUniformLocation;
  private uTime: WebGLUniformLocation;

  private me = 0;
  private active = false;
  private uploaded = new Uint8Array(ATTACK_FRONT_SIZE);

  constructor(
    gl: WebGL2RenderingContext,
    private mapW: number,
    private mapH: number,
    private tileTex: WebGLTexture,
  ) {
    this.gl = gl;
    this.program = createProgram(
      gl,
      overlayVertSrc,
      shaderSrc(attackFrontFragSrc, { ...TILE_DEFINES }),
    );
    this.uCamera = gl.getUniformLocation(this.program, "uCamera")!;
    this.uMapSize = gl.getUniformLocation(this.program, "uMapSize")!;
    this.uMe = gl.getUniformLocation(this.program, "uMe")!;
    this.uTime = gl.getUniformLocation(this.program, "uTime")!;

    gl.useProgram(this.program);
    gl.uniform1i(gl.getUniformLocation(this.program, "uTileTex"), 0);
    gl.uniform1i(gl.getUniformLocation(this.program, "uFrontTex"), 1);
    const color = (name: string, c: readonly [number, number, number]) =>
      gl.uniform3f(
        gl.getUniformLocation(this.program, name),
        c[0] / 255,
        c[1] / 255,
        c[2] / 255,
      );
    color("uOutColor", OUTGOING_COLOR);
    color("uInColor", INCOMING_COLOR);

    this.frontTex = createTexture2D(gl, {
      width: ATTACK_FRONT_SIZE,
      height: 1,
      internalFormat: gl.R8UI,
      format: gl.RED_INTEGER,
      type: gl.UNSIGNED_BYTE,
      data: this.uploaded,
      filter: gl.NEAREST,
    });
    this.vao = createMapQuad(gl, mapW, mapH);
  }

  /** Takes this tick's front flags; uploads only when they changed. */
  update(fronts: Uint8Array, mySmallID: number): void {
    this.me = mySmallID;
    let changed = false;
    let any = false;
    for (let i = 0; i < ATTACK_FRONT_SIZE; i++) {
      const f = fronts[i];
      if (f !== 0) any = true;
      if (f !== this.uploaded[i]) {
        this.uploaded[i] = f;
        changed = true;
      }
    }
    this.active = any && mySmallID > 0;
    if (!changed) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.frontTex);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      ATTACK_FRONT_SIZE,
      1,
      gl.RED_INTEGER,
      gl.UNSIGNED_BYTE,
      this.uploaded,
    );
  }

  draw(cameraMatrix: Float32Array): void {
    if (!this.active) return;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniformMatrix3fv(this.uCamera, false, cameraMatrix);
    gl.uniform2f(this.uMapSize, this.mapW, this.mapH);
    gl.uniform1ui(this.uMe, this.me);
    gl.uniform1f(this.uTime, (performance.now() % 1_000_000) / 1000);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tileTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.frontTex);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.program);
    gl.deleteVertexArray(this.vao);
    gl.deleteTexture(this.frontTex);
  }
}
