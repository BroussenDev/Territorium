#version 300 es
precision highp float;

// The open sea around the map: it carries on from the map's deep water, the
// Territorium tile mesh fades in a little way out, and far away the sea only
// dims slightly towards the menu's night, so a full zoom-out shows ocean
// everywhere.

in vec2 vWorldPos;

uniform vec2 uMapSize;
uniform vec3 uOceanColor;
uniform vec3 uNightColor;
// Tiles per mesh cell, in world units.
uniform float uCellSize;

out vec4 fragColor;

void main() {
  vec2 p = vWorldPos;
  // The map itself is drawn by the terrain pass.
  if (p.x >= 0.0 && p.y >= 0.0 && p.x <= uMapSize.x && p.y <= uMapSize.y) {
    discard;
  }

  // Distance to the map rectangle, in tiles.
  vec2 outside = max(max(-p, p - uMapSize), vec2(0.0));
  float dist = length(outside);
  float span = max(uMapSize.x, uMapSize.y);

  // Deep water at the map edge, a touch of night far out.
  float night = smoothstep(span * 0.1, span * 1.5, dist);
  vec3 color = mix(uOceanColor, uNightColor, night * 0.3);

  // Tile mesh: thin dark lines, anti-aliased in screen space, absent right at
  // the map edge so the sea meets the map without a seam.
  vec2 cell = p / uCellSize;
  vec2 grid = abs(fract(cell - 0.5) - 0.5) / fwidth(cell);
  float line = 1.0 - min(min(grid.x, grid.y), 1.0);
  // Hide the mesh once cells shrink to a few pixels (avoids moiré).
  float cellPx = 1.0 / max(fwidth(cell.x), 1e-5);
  float meshFade = smoothstep(4.0, 10.0, cellPx);
  float meshIn = smoothstep(span * 0.04, span * 0.25, dist);
  color = mix(color, color * 0.7, line * meshFade * meshIn * 0.5);

  fragColor = vec4(color, 1.0);
}
