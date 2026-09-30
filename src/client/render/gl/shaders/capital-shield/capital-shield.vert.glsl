#version 300 es
precision highp float;

// Unit quad [0,1]
layout(location = 0) in vec2 aPos;

uniform mat3 uCamera;
uniform vec2 uCenter;   // capital tile (tile coords)
uniform float uRadius;  // shield radius in tiles

out vec2 vOffset; // world-space offset from the shield center, in tiles
out vec2 vWorld;  // world-space position, in tiles

void main() {
  // Pad the quad by 2 tiles for the outer glow.
  float r = uRadius + 2.0;
  vOffset = (aPos * 2.0 - 1.0) * r;
  vWorld = uCenter + 0.5 + vOffset;

  vec3 clip = uCamera * vec3(vWorld, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
}
