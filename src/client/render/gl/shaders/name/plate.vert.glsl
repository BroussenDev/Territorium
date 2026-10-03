#version 300 es
precision highp float;

// One cartouche per player, drawn behind the name, troop count and flag.
// The sizing must match name.vert.glsl and icon.vert.glsl exactly.

layout(location = 0) in vec2 aPos; // unit quad [0,0]→[1,1]

uniform sampler2D uPlayerData;
uniform mat3  uCamera;
uniform float uTime;
uniform float uLerpSpeed;
uniform float uCullThreshold;
uniform float uFontSize;
uniform float uFontBase;
uniform float uNameScaleFactor;
uniform float uNameScaleCap;
uniform float uFlagCellW;
uniform float uFlagCellH;
uniform float uHighlightOwnerID;
uniform float uFadeOwnerID;
uniform float uHoverFadeAlpha;

out vec2 vLocal;       // position inside the plate, in plate heights
flat out vec2 vHalf;   // half size of the plate, in plate heights
flat out vec4 vColor;  // player colour (rgb) + alpha

void hide() {
  gl_Position = vec4(0.0);
  vLocal = vec2(0.0);
  vHalf = vec2(0.0);
  vColor = vec4(0.0);
}

void main() {
  int playerIdx = gl_InstanceID;
  vec4 pd0 = texelFetch(uPlayerData, ivec2(0, playerIdx), 0);
  vec4 pd1 = texelFetch(uPlayerData, ivec2(1, playerIdx), 0);
  vec4 pd2 = texelFetch(uPlayerData, ivec2(2, playerIdx), 0);
  vec4 pd3 = texelFetch(uPlayerData, ivec2(3, playerIdx), 0);
  vec4 pd4 = texelFetch(uPlayerData, ivec2(4, playerIdx), 0);
  if (pd1.w <= 0.0 || pd3.x <= 0.0) { hide(); return; }

  float elapsed = uTime - pd0.w;
  float t = clamp(1.0 - exp(-uLerpSpeed * elapsed), 0.0, 1.0);
  float wx = mix(pd0.x, pd1.x, t);
  float wy = mix(pd0.y, pd1.y, t);
  float ws = mix(pd0.z, pd1.z, t);

  float baseSize = max(1.0, floor(ws));
  float nameSize = max(4.0, floor(baseSize * uNameScaleFactor));
  float nameScale = min(baseSize * 0.25, uNameScaleCap);
  float nws = (nameSize * nameScale) / uFontSize;

  float smallID = pd4.z;
  bool isHighlighted = uHighlightOwnerID > 0.0 && smallID == uHighlightOwnerID;
  bool isTargeted = texelFetch(uPlayerData, ivec2(6, playerIdx), 0).y > 0.5;
  float cameraScale = length(vec2(uCamera[0][0], uCamera[1][0]));
  float screenSize = nws * uFontBase * cameraScale;
  if (isTargeted && screenSize < uCullThreshold) {
    nws *= uCullThreshold / screenSize;
    screenSize = uCullThreshold;
  }
  if (screenSize < uCullThreshold && !isHighlighted) { hide(); return; }

  float line = uFontBase * nws;
  float halfName = pd3.w * nws;
  float flagW = 0.0;
  if (pd4.x >= 0.0) {
    flagW = line * 1.2 * (uFlagCellW / uFlagCellH);
  }
  float pad = line * 0.32;
  float left = wx - halfName - flagW - pad;
  float right = wx + halfName + pad;
  float top = wy - line * 0.62;
  // The troop count sits 1.1 lines below the name, at 0.6 of its size.
  float bottom = wy + line * (pd3.y > 0.0 ? 1.48 : 0.62);

  vec2 size = vec2(right - left, bottom - top);
  vec2 worldPos = vec2(left, top) + aPos * size;
  vec3 clip = uCamera * vec3(worldPos, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);

  float unit = size.y;
  vHalf = size * 0.5 / unit;
  vLocal = (aPos - 0.5) * size / unit;
  float hoverAlpha = (uFadeOwnerID > 0.0 && smallID == uFadeOwnerID)
    ? uHoverFadeAlpha : 1.0;
  vColor = vec4(pd2.rgb, pd2.a * hoverAlpha);
}
