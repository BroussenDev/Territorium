#version 300 es
precision highp float;

// Unit quad [0,1]
layout(location = 0) in vec2 aPos;

uniform mat3 uCamera;
uniform vec2 uAnchor;   // world-space point the label sits above
uniform vec2 uOffsetPx; // label bottom center, device pixels above the anchor
uniform vec2 uSizePx;   // label size in device pixels
uniform vec2 uViewport; // drawing buffer size in device pixels

out vec2 vUV;

void main() {
  vec3 clip = uCamera * vec3(uAnchor, 1.0);
  // Screen pixels, y down: the quad grows up from its bottom edge.
  vec2 px = vec2((aPos.x - 0.5) * uSizePx.x + uOffsetPx.x,
                 -(aPos.y * uSizePx.y + uOffsetPx.y));
  gl_Position = vec4(clip.xy + px * vec2(2.0, -2.0) / uViewport, 0.0, 1.0);
  vUV = vec2(aPos.x, 1.0 - aPos.y);
}
