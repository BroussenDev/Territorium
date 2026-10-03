#version 300 es
precision highp float;
precision highp usampler2D;

// The local player's land fronts: a thin line that pulses along the border
// with each player they fight, a soft glow on both sides, and a small
// arrowhead in every other border tile on the defending side, lit by a wave
// that runs the way the attack goes. Emerald for the player's own attacks,
// red for attacks on them.

in vec2 vWorldPos;

uniform usampler2D uTileTex;  // R16UI: tile state per cell
uniform usampler2D uFrontTex; // R8UI, 1024x1: front flags per smallID
uniform vec2 uMapSize;
uniform uint uMe;
uniform float uTime;
uniform vec3 uOutColor;
uniform vec3 uInColor;

out vec4 fragColor;

// How far from the border, in tiles, the effect reaches.
const int REACH = 2;

uint ownerAt(ivec2 c) {
  if (c.x < 0 || c.y < 0 || c.x >= int(uMapSize.x) || c.y >= int(uMapSize.y))
    return 0u;
  return texelFetch(uTileTex, c, 0).r & uint(OWNER_MASK);
}

uint frontOf(uint owner) {
  if (owner == 0u || owner >= 1024u) return 0u;
  return texelFetch(uFrontTex, ivec2(int(owner), 0), 0).r;
}

void main() {
  vec2 p = vWorldPos;
  ivec2 tc = ivec2(floor(p));
  if (tc.x < 0 || tc.y < 0 || tc.x >= int(uMapSize.x) || tc.y >= int(uMapSize.y))
    discard;

  uint owner = ownerAt(tc);
  bool mine = owner == uMe && uMe != 0u;
  uint ownFlags = mine ? 0u : frontOf(owner);
  if (!mine && ownFlags == 0u) discard;

  // Nearest tile of the other side, and the direction towards that side.
  float best = 1e9;
  uint flags = 0u;
  // Tile-level: ring distance to the other side, and the direction to it.
  int ring = 99;
  vec2 towardOther = vec2(0.0);
  for (int dy = -REACH; dy <= REACH; dy++) {
    for (int dx = -REACH; dx <= REACH; dx++) {
      ivec2 c = tc + ivec2(dx, dy);
      uint n = ownerAt(c);
      uint nFlags = mine ? (n != uMe ? frontOf(n) : 0u)
                         : (n == uMe ? ownFlags : 0u);
      if (nFlags == 0u) continue;
      vec2 d = vec2(c) + 0.5 - p;
      // Distance to that tile's square, so the border reads as a straight
      // edge rather than a row of tile-centred circles.
      float dist = length(max(abs(d) - 0.5, 0.0));
      if (dist < best) {
        best = dist;
        flags = nFlags;
      }
      ring = min(ring, max(abs(dx), abs(dy)));
      vec2 o = vec2(dx, dy);
      towardOther += o / dot(o, o);
    }
  }
  if (flags == 0u) discard;

  // A fight both ways reads as a threat: red wins.
  bool incoming = (flags & 2u) != 0u;
  vec3 color = incoming ? uInColor : uOutColor;

  // Distance from the border in tiles, and the size of a screen pixel.
  float edge = best;
  float px = fwidth(p.x);
  float pulse = 0.5 + 0.5 * sin(uTime * 3.2);

  // Thin core line on the border itself.
  float lineW = max(px * 1.2, 0.08);
  float line = 1.0 - smoothstep(lineW, lineW + px * 1.5, edge);
  // Soft glow fading inland on both sides.
  float glow = exp(-edge * 2.2) * 0.32;

  // Arrowheads, only once tiles are big enough on screen to read them: in
  // every other border tile on the side being attacked, pointing away from
  // the attacker, lit by a wave that travels with the attack.
  float tilePx = 1.0 / max(px, 1e-5);
  float chevVisible = smoothstep(7.0, 14.0, tilePx);
  bool defenderSide = incoming ? mine : !mine;
  float chev = 0.0;
  if (defenderSide && ring == 1 && ((tc.x + tc.y) & 1) == 0 &&
      chevVisible > 0.0) {
    vec2 arrow = normalize(-towardOther + 1e-5);
    vec2 side = vec2(-arrow.y, arrow.x);
    vec2 lp = fract(p) - 0.5;
    float a = dot(lp, arrow);
    float b = dot(lp, side);
    float stroke = abs(a + abs(b) * 0.9 - 0.12);
    float w = max(0.07, px * 1.1);
    float head = (1.0 - smoothstep(w, w + px * 1.5, stroke)) *
      (1.0 - smoothstep(0.28, 0.32, abs(b)));
    float wave = 0.5 + 0.5 * sin(dot(vec2(tc), arrow) * 1.4 - uTime * 4.0);
    chev = head * (0.3 + 0.7 * wave) * chevVisible;
  }

  float fade = 1.0 - smoothstep(float(REACH) - 0.5, float(REACH) + 0.5, edge);
  float alpha = line * (0.7 + 0.3 * pulse) + glow * (0.55 + 0.45 * pulse) +
    chev * 0.9;
  alpha = clamp(alpha * fade, 0.0, 0.9);
  if (alpha <= 0.002) discard;

  vec3 lit = mix(color, vec3(1.0), line * 0.35 * pulse);
  fragColor = vec4(lit, alpha);
}
