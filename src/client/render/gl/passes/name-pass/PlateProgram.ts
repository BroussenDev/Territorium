/**
 * PlateProgram — the cartouche behind each player's name.
 *
 * One instance per player: a translucent night plate, rimmed and underlined in
 * the player's territory colour, sized to the name, the troop count and the
 * flag. Drawn before the text so the names sit on top of it.
 *
 * Owns: shader program, uniform locations.
 * The shared playerDataTex is passed in but not owned/deleted.
 */

import type { RenderSettings } from "../../RenderSettings";
import plateFragSrc from "../../shaders/name/plate.frag.glsl?raw";
import plateVertSrc from "../../shaders/name/plate.vert.glsl?raw";
import { createProgram } from "../../utils/GlUtils";
import type { ParsedAtlas } from "./Types";

// Must match FLAG_CELL_W / FLAG_CELL_H in FlagAtlasArray.ts.
const FLAG_CELL_W = 128;
const FLAG_CELL_H = 85;

export class PlateProgram {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private playerDataTex: WebGLTexture;
  private maxPlayers: number;

  private uCamera: WebGLUniformLocation;
  private uTime: WebGLUniformLocation;
  private uLerpSpeed: WebGLUniformLocation;
  private uCullThreshold: WebGLUniformLocation;
  private uNameScaleFactor: WebGLUniformLocation;
  private uNameScaleCap: WebGLUniformLocation;
  private uHighlightOwnerID: WebGLUniformLocation;
  private uFadeOwnerID: WebGLUniformLocation;
  private uHoverFadeAlpha: WebGLUniformLocation;
  private uPlateAlpha: WebGLUniformLocation;

  constructor(
    gl: WebGL2RenderingContext,
    atlas: ParsedAtlas,
    playerDataTex: WebGLTexture,
    maxPlayers: number,
  ) {
    this.gl = gl;
    this.playerDataTex = playerDataTex;
    this.maxPlayers = maxPlayers;

    this.program = createProgram(gl, plateVertSrc, plateFragSrc);
    gl.useProgram(this.program);
    gl.uniform1i(gl.getUniformLocation(this.program, "uPlayerData"), 0);
    gl.uniform1f(
      gl.getUniformLocation(this.program, "uFontSize"),
      atlas.fontSize,
    );
    gl.uniform1f(gl.getUniformLocation(this.program, "uFontBase"), atlas.base);
    gl.uniform1f(
      gl.getUniformLocation(this.program, "uFlagCellW"),
      FLAG_CELL_W,
    );
    gl.uniform1f(
      gl.getUniformLocation(this.program, "uFlagCellH"),
      FLAG_CELL_H,
    );

    const loc = (name: string) => gl.getUniformLocation(this.program, name)!;
    this.uCamera = loc("uCamera");
    this.uTime = loc("uTime");
    this.uLerpSpeed = loc("uLerpSpeed");
    this.uCullThreshold = loc("uCullThreshold");
    this.uNameScaleFactor = loc("uNameScaleFactor");
    this.uNameScaleCap = loc("uNameScaleCap");
    this.uHighlightOwnerID = loc("uHighlightOwnerID");
    this.uFadeOwnerID = loc("uFadeOwnerID");
    this.uHoverFadeAlpha = loc("uHoverFadeAlpha");
    this.uPlateAlpha = loc("uPlateAlpha");
  }

  draw(
    cameraMatrix: Float32Array,
    settings: RenderSettings,
    vao: WebGLVertexArrayObject,
    highlightOwnerID: number,
    fadeOwnerID: number,
  ): void {
    const ns = settings.name;
    if (ns.plateAlpha <= 0) return;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniformMatrix3fv(this.uCamera, false, cameraMatrix);
    gl.uniform1f(this.uTime, performance.now() / 1000);
    gl.uniform1f(this.uLerpSpeed, ns.lerpSpeed);
    gl.uniform1f(this.uCullThreshold, ns.cullThreshold);
    gl.uniform1f(this.uNameScaleFactor, ns.nameScaleFactor);
    gl.uniform1f(this.uNameScaleCap, ns.nameScaleCap);
    gl.uniform1f(this.uHighlightOwnerID, highlightOwnerID);
    gl.uniform1f(this.uFadeOwnerID, fadeOwnerID);
    gl.uniform1f(this.uHoverFadeAlpha, ns.hoverFadeAlpha);
    gl.uniform1f(this.uPlateAlpha, ns.plateAlpha);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.playerDataTex);
    gl.bindVertexArray(vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.maxPlayers);
  }

  dispose(): void {
    this.gl.deleteProgram(this.program);
  }
}
