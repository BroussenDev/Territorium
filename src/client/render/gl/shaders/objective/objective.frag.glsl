#version 300 es
precision highp float;

in vec2 vWorld; // offset from the zone center, in tiles

uniform float uRadius;    // zone radius in tiles
uniform float uPx;        // tiles per screen pixel
uniform vec3 uHolderColor;
uniform float uHeld;      // 1 when someone holds the zone
uniform vec3 uCapColor;
uniform float uProgress;  // capture progress, 0..1
uniform float uTime;      // seconds, for the contested pulse

out vec4 fragColor;

const float PI = 3.14159265;

// 1 inside [inner, outer], antialiased over one screen pixel.
float band(float d, float inner, float outer) {
  float aa = uPx;
  return smoothstep(inner - aa, inner + aa, d) *
         (1.0 - smoothstep(outer - aa, outer + aa, d));
}

vec4 over(vec4 top, vec4 under) {
  float a = top.a + under.a * (1.0 - top.a);
  if (a <= 0.0) return vec4(0.0);
  vec3 rgb = (top.rgb * top.a + under.rgb * under.a * (1.0 - top.a)) / a;
  return vec4(rgb, a);
}

void main() {
  float d = length(vWorld);
  vec3 base = mix(vec3(1.0), uHolderColor, uHeld);
  bool contested = uProgress > 0.0;

  // Tint inside the zone.
  float inside = 1.0 - smoothstep(uRadius - uPx, uRadius + uPx, d);
  vec4 c = vec4(base, inside * mix(0.10, 0.22, uHeld));

  // Edge ring, dashed while nobody holds the zone; pulses while contested.
  float ringW = max(1.0, 2.0 * uPx);
  float ang = atan(vWorld.y, vWorld.x);
  float dash = mix(step(0.0, sin(ang * 14.0)), 1.0, uHeld);
  float pulse = contested ? 0.65 + 0.35 * sin(uTime * 6.0) : 1.0;
  float ring = band(d, uRadius - ringW, uRadius) * dash * 0.9 * pulse;
  // Dark halo so the ring reads on its holder's own territory and on snow.
  float halo = band(d, uRadius - ringW - 1.5 * uPx, uRadius + 1.5 * uPx);
  c = over(vec4(0.0, 0.0, 0.0, halo * dash * 0.45 * pulse), c);
  c = over(vec4(base, ring), c);

  // Diamond marker at the center.
  float size = min(uRadius * 0.45, max(1.6, 6.0 * uPx));
  float m = abs(vWorld.x) + abs(vWorld.y);
  float edge = size * 1.3;
  float outline = 1.0 - smoothstep(edge - uPx, edge + uPx, m);
  float marker = 1.0 - smoothstep(size - uPx, size + uPx, m);
  c = over(vec4(0.0, 0.0, 0.0, outline * 0.6), c);
  c = over(vec4(base, marker), c);

  // Capture arc outside the ring, clockwise from the top.
  if (contested) {
    float arcIn = uRadius + max(0.6, 1.5 * uPx);
    float arcOut = arcIn + max(1.4, 4.0 * uPx);
    float track = band(d, arcIn, arcOut);
    float t = atan(vWorld.x, -vWorld.y);
    t = (t < 0.0 ? t + 2.0 * PI : t) / (2.0 * PI);
    c = over(vec4(0.0, 0.0, 0.0, track * 0.4), c);
    c = over(vec4(uCapColor, track * step(t, uProgress)), c);
  }

  if (c.a < 0.003) discard;
  fragColor = c;
}
