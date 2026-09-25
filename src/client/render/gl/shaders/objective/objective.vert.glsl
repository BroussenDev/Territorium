#version 300 es
precision highp float;

// Unit quad [0,1]
layout(location = 0) in vec2 aPos;

uniform mat3 uCamera;
uniform vec2 uCenter;  // world-space zone center (tile coords)
uniform float uExtent; // world-space half size of the quad, in tiles

out vec2 vWorld; // offset from the zone center, in tiles

void main() {
  vec2 local = aPos * 2.0 - 1.0;
  vWorld = local * uExtent;
  vec2 worldPos = uCenter + 0.5 + vWorld;
  vec3 clip = uCamera * vec3(worldPos, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
}
