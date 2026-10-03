#version 300 es
precision highp float;

// The cartouche: a translucent night plate with slightly cut corners, a thin
// rim and a bar along the bottom in the player's territory colour.

uniform float uPlateAlpha;

in vec2 vLocal;
flat in vec2 vHalf;
flat in vec4 vColor;

out vec4 fragColor;

void main() {
  if (vColor.a <= 0.0 || uPlateAlpha <= 0.0) discard;

  // Rounded-rectangle distance, corner radius a tenth of the plate height.
  float r = 0.1;
  vec2 q = abs(vLocal) - (vHalf - r);
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  float aa = fwidth(d);
  float inside = 1.0 - smoothstep(-aa, aa, d);
  if (inside <= 0.0) discard;

  vec3 night = vec3(0.04, 0.08, 0.07);
  float rimW = max(aa * 1.2, 0.025);
  float rim = smoothstep(-rimW - aa, -rimW, d);
  // Bottom bar: the player's colour, a twelfth of the plate high.
  float bar = smoothstep(vHalf.y - 0.085 - aa, vHalf.y - 0.085, vLocal.y);

  vec3 color = mix(night, vColor.rgb, max(bar, rim * 0.75));
  float alpha = mix(uPlateAlpha, 0.95, max(bar, rim * 0.6));
  fragColor = vec4(color, alpha * inside * vColor.a);
}
