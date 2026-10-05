#version 300 es
precision highp float;

// An attack troop plate: a night plate with rounded corners and a thin rim in
// the attack's colour, and on its left a round badge of that colour with an
// arrow pointing the way the troops move. The count itself is drawn on top by
// the world-text program.

in vec2 vLocal;
flat in vec2 vHalf;
flat in vec4 vColor;
flat in vec2 vDir;

out vec4 fragColor;

// Must match PLATE_* in WorldTextPass.ts (in plate heights).
const float PAD = 0.16;
const float BADGE_R = 0.34;

float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  if (vColor.a <= 0.0) discard;

  // Plate: rounded rectangle, corner radius a third of its height.
  float r = 0.32;
  vec2 q = abs(vLocal) - (vHalf - r);
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  float aa = fwidth(d);
  float inside = 1.0 - smoothstep(-aa, aa, d);
  if (inside <= 0.0) discard;

  vec3 night = vec3(0.035, 0.07, 0.06);
  float rimW = max(aa * 1.2, 0.05);
  float rim = smoothstep(-rimW - aa, -rimW, d);
  vec3 color = mix(night, vColor.rgb, rim * 0.85);
  float alpha = mix(0.86, 0.95, rim);

  // Badge on the left.
  vec2 bc = vec2(-vHalf.x + PAD + BADGE_R, 0.0);
  vec2 p = vLocal - bc;
  float bd = length(p) - BADGE_R;
  float baa = fwidth(bd);
  float badge = 1.0 - smoothstep(-baa, baa, bd);
  color = mix(color, vColor.rgb, badge);

  // Arrow in the badge, turned to the troops' direction: a shaft and a head
  // made of rounded strokes.
  vec2 dir = length(vDir) > 0.0 ? normalize(vDir) : vec2(1.0, 0.0);
  vec2 a = vec2(dot(p, dir), dot(p, vec2(-dir.y, dir.x))) / BADGE_R;
  float stroke = 0.15;
  float ad = min(
    sdSegment(a, vec2(-0.52, 0.0), vec2(0.42, 0.0)),
    min(
      sdSegment(a, vec2(0.48, 0.0), vec2(0.06, 0.4)),
      sdSegment(a, vec2(0.48, 0.0), vec2(0.06, -0.4))
    )
  ) - stroke;
  float aaa = fwidth(ad);
  float arrow = (1.0 - smoothstep(-aaa, aaa, ad)) * badge;
  color = mix(color, night, arrow);

  fragColor = vec4(color, alpha * inside * vColor.a);
}
