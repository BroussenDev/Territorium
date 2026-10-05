#version 300 es
precision highp float;

// The plate behind an attack troop count: one quad per label, sized and
// placed CPU-side (WorldTextPass) so it stays the same size on screen.

layout(location = 0) in vec2 aPos; // unit quad [0,0]→[1,1]

// Per-instance: centre x, centre y, half width, half height (world units)
layout(location = 1) in vec4 aRect;
// Per-instance: colour (rgb) + alpha
layout(location = 2) in vec4 aColor;
// Per-instance: direction the troops move in (unit vector, world axes)
layout(location = 3) in vec2 aDir;

uniform mat3 uCamera;

out vec2 vLocal;       // position inside the plate, in plate heights
flat out vec2 vHalf;   // half size of the plate, in plate heights
flat out vec4 vColor;
flat out vec2 vDir;

void main() {
  vec2 halfSize = aRect.zw;
  vec2 worldPos = aRect.xy + (aPos * 2.0 - 1.0) * halfSize;
  vec3 clip = uCamera * vec3(worldPos, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);

  float unit = halfSize.y * 2.0;
  vHalf = halfSize / unit;
  vLocal = (aPos - 0.5) * halfSize * 2.0 / unit;
  vColor = aColor;
  vDir = aDir;
}
