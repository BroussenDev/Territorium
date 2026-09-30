#version 300 es
precision highp float;

in vec2 vOffset;
in vec2 vWorld;

uniform float uRadius;
uniform float uTime;     // seconds
uniform float uStrength; // 0..1, fades the shield out as it ends

out vec4 fragColor;

const vec3 DEEP = vec3(0.16, 0.52, 0.86);
const vec3 BRIGHT = vec3(0.73, 0.91, 1.0);

// Distance to the nearest edge of a hexagonal cell (0 on the edge).
float hexEdge(vec2 p) {
  const vec2 s = vec2(1.0, 1.7320508);
  vec4 hc = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
  vec4 h = vec4(p - hc.xy * s, p - (hc.zw + 0.5) * s);
  vec2 q = dot(h.xy, h.xy) < dot(h.zw, h.zw) ? h.xy : h.zw;
  q = abs(q);
  return 0.5 - max(dot(q, s * 0.5), q.x);
}

void main() {
  float d = length(vOffset);
  float inside = 1.0 - smoothstep(uRadius - 0.3, uRadius + 0.3, d);
  float rel = clamp(d / uRadius, 0.0, 1.0);

  // Dome: faint in the middle, denser towards the rim.
  float dome = inside * (0.07 + 0.22 * rel * rel * rel);

  // Hex lattice, lit by a slow wave rising from the capital.
  float wave = 0.5 + 0.5 * sin(d * 1.3 - uTime * 2.2);
  float lattice = inside * (1.0 - smoothstep(0.0, 0.07, hexEdge(vWorld / 1.3)))
                * (0.08 + 0.22 * wave * rel);

  // Barrier wall: a bright rim with a light running around it.
  float ring = 1.0 - smoothstep(0.25, 0.65, abs(d - uRadius));
  float angle = atan(vOffset.y, vOffset.x);
  float sweep = pow(max(0.0, cos(angle - uTime * 1.4)), 12.0);
  float glow = (1.0 - smoothstep(uRadius, uRadius + 1.8, d)) * (1.0 - inside);

  vec3 color = mix(DEEP, BRIGHT, clamp(ring + lattice * 1.5, 0.0, 1.0));
  float alpha = dome + lattice + ring * (0.75 + 0.25 * sweep) + glow * 0.25;
  alpha *= uStrength;
  if (alpha < 0.004) discard;
  fragColor = vec4(color + sweep * ring * 0.3, min(alpha, 1.0));
}
