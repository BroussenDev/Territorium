#version 300 es
precision highp float;
precision highp usampler2D;

uniform usampler2D uTileTex;
uniform vec2 uMapSize;

uniform float uBreathRadius;   // normalized [0..1], animated via sin

// Configurable parameters (from render settings)
uniform float uHighlightRadiusSq; // tile highlight radius squared
uniform float uHighlightAlpha;    // tile highlight opacity
uniform vec4 uSelfRadii;          // (minR, maxR, _, _)
uniform vec4 uMateRadii;          // (minR, maxR, _, _)
uniform vec2 uGradientStops;      // (innerEdge, solidEnd)

// Versus spawn zone: the rectangle the local team may spawn in (x, y, w, h)
// and the no-spawn disc at the map centre (x, y, radius), all in tiles.
uniform vec4 uZone;
uniform vec3 uZoneHole;

in vec2 vWorldPos;
flat in vec2 vCenter;
flat in float vKind;   // 0 = enemy highlight, 1 = self ring, 2 = teammate ring,
                       // 3 = versus spawn zone
flat in vec3 vColor;

out vec4 fragColor;

void main() {
  float dx = vWorldPos.x - vCenter.x;
  float dy = vWorldPos.y - vCenter.y;
  float distSq = dx * dx + dy * dy;
  float dist = sqrt(distSq);

  // --- Versus spawn zone: veil the land the local team can't spawn on ---
  if (vKind > 2.5) {
    vec2 tile = floor(vWorldPos);
    if (tile.x < 0.0 || tile.y < 0.0 || tile.x >= uMapSize.x || tile.y >= uMapSize.y)
      discard;
    vec2 fromHole = tile - uZoneHole.xy;
    bool allowed = tile.x >= uZone.x && tile.x < uZone.x + uZone.z &&
      tile.y >= uZone.y && tile.y < uZone.y + uZone.w &&
      dot(fromHole, fromHole) >= uZoneHole.z * uZoneHole.z;
    fragColor = allowed ? vec4(vColor, 0.12) : vec4(0.0, 0.0, 0.0, 0.5);
    return;
  }

  // --- Enemy tile highlights: only unowned tiles within radius ---
  if (vKind < 0.5) {
    ivec2 tc = ivec2(floor(vWorldPos));
    if (tc.x < 0 || tc.y < 0 || tc.x >= int(uMapSize.x) || tc.y >= int(uMapSize.y))
      discard;
    if (distSq > uHighlightRadiusSq) discard;
    uint raw = texelFetch(uTileTex, tc, 0).r;
    if ((raw & uint(OWNER_MASK)) != 0u) discard; // owned tile → no highlight
    fragColor = vec4(vColor, uHighlightAlpha);
    return;
  }

  // --- Breathing rings (self or teammate) ---
  float minR, maxR;
  vec3 color;
  if (vKind > 1.5) {
    minR = uMateRadii.x;
    maxR = uMateRadii.y;
    color = vColor;
  } else {
    minR = uSelfRadii.x;
    maxR = uSelfRadii.y;
    // Self ring pulses white → its base color in phase with the breath so one
    // end of the pulse always contrasts with the terrain.
    color = mix(vec3(1.0), vColor, uBreathRadius);
  }

  // Breathing ring: the gradient halo shrinks/expands in radius AND its
  // opacity pulses in phase with the breath — both driven by uBreathRadius.
  // Smooth bell shape: glow ramps up from center to the inner edge, stays
  // solid through the ring's body, then fades out past solidEnd.
  float scale = 0.5 + 0.65 * uBreathRadius; // 0.5 → 1.15 of base radius
  float bMinR = minR * scale;
  float bMaxR = maxR * scale;
  float range = bMaxR - bMinR;
  float t = (dist - bMinR) / range;
  float solidEnd = uGradientStops.y;
  float alpha = 0.0;
  if (dist < bMinR) {
    // Inner glow: transparent at the center (so your territory shows through)
    // ramping up to fully solid at the ring's inner edge.
    alpha = dist / max(bMinR, 0.001);
  } else if (t < solidEnd) {
    alpha = 1.0;
  } else if (t < 1.0) {
    alpha = 1.0 - (t - solidEnd) / (1.0 - solidEnd);
  }
  if (alpha <= 0.0) discard;
  // Opacity pulses 65% → 100% in phase with the radius.
  alpha *= 0.65 + 0.35 * uBreathRadius;
  fragColor = vec4(color, alpha);
}
