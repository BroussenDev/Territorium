#version 300 es
precision highp float;

uniform float uRingWidth;
uniform float uTime;      // seconds — animates procedural styles

in vec2  vLocalPos;
flat in float vAlpha;   // 1 - lifetime progress (fades out over the effect)
flat in float vStyle;   // 0 = classic ring, 1 = EMP pulse, 2 = sparkles, 3 = embers, 4 = EMP burst
flat in vec3  vColor0;  // cosmetic: palette color 0
flat in vec3  vColor1;  // cosmetic: palette color 1
flat in vec3  vColor2;  // cosmetic: palette color 2 (pads repeat the last color)
flat in vec3  vColor3;  // cosmetic: palette color 3 (pads repeat the last color)
flat in float vColorCount; // active palette size (1..4)
flat in float vSpeed;   // cosmetic: animation-speed multiplier
flat in float vTransSpeed; // cosmetic: palette step rate (colors/s)
flat in float vThickness; // ring band thickness / avg sparkle size (world tiles)
flat in float vCell;    // sparkles: grid pitch (front-normalized); embers: keep-fraction
flat in float vRadius;  // current front radius (world tiles)

// Palette lookup by (already-wrapped) index.
vec3 colorAt(float i) {
  if (i < 0.5) return vColor0;
  if (i < 1.5) return vColor1;
  if (i < 2.5) return vColor2;
  return vColor3;
}

out vec4 fragColor;

// --- cheap 1D value noise -------------------------------------------------
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float vnoise(float x) {
  float i = floor(x);
  float f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(hash11(i), hash11(i + 1.0), u);
}
float vnoise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash11(dot(i, vec2(127.1, 311.7)));
  float b = hash11(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7)));
  float c = hash11(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7)));
  float d = hash11(dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Classic expanding white ring (SAM, and nuke style 0).
void classicRing(float dist) {
  float ringDist = abs(dist - 1.0);
  float ring = 1.0 - smoothstep(0.0, uRingWidth, ringDist);
  if (ring < 0.01) discard;
  fragColor = vec4(1.0, 1.0, 1.0, ring * vAlpha);
}

// EMP energy pulse — a jagged, crackling ring with rotating lightning arcs and
// a faint trailing energy fill. Colored by the firing player's cosmetic.
void empPulse(float dist) {
  float ang = atan(vLocalPos.y, vLocalPos.x); // -pi..pi
  float tt = uTime * vSpeed;                   // speed-scaled animation time

  // Jagged front: perturb the ideal r=1.0 ring by angular + time noise.
  float n = vnoise(ang * 6.0 + tt * 6.0)
          + 0.5 * vnoise(ang * 17.0 - tt * 11.0);
  float ringR = 0.95 + n * 0.05;
  float ringDist = abs(dist - ringR);

  // Band half-width in local units (dist 1.0 = vRadius world tiles), so the
  // cosmetic's thickness stays constant in tiles while the ring expands.
  // Per-angle flicker (averages ~1.0×) keeps it feeling electric.
  float halfW = 0.5 * vThickness / max(vRadius, 0.001);
  float w = halfW * (0.7 + 0.6 * vnoise(ang * 9.0 + tt * 20.0));
  float ring = 1.0 - smoothstep(0.0, w, ringDist);

  // A couple of bright rotating arcs of "lightning" chasing around the ring.
  float arc = pow(0.5 + 0.5 * sin(ang * 5.0 - tt * 8.0), 8.0)
            + pow(0.5 + 0.5 * sin(ang * 8.0 + tt * 13.0), 12.0);

  // Faint inner energy fill trailing behind the front.
  float inner = smoothstep(ringR, 0.0, dist) * 0.12
              * (0.6 + 0.4 * vnoise(ang * 20.0 + tt * 25.0));

  float glow = ring * (0.8 + arc) + inner;
  if (glow < 0.01) discard;

  // Base color cycles through the whole palette (color0 → color1 → … → wrap)
  // at transitionSpeed steps/s, like the trail shader's transition (0 →
  // static color0, negative → reverse cycle). Arcs flare toward white.
  float idx = uTime * vTransSpeed;
  vec3 base = mix(
    colorAt(mod(floor(idx), vColorCount)),
    colorAt(mod(floor(idx) + 1.0, vColorCount)),
    fract(idx));
  // Padded slots repeat a real color, so this max spans the active palette.
  vec3 bright = max(max(vColor0, vColor1), max(vColor2, vColor3));
  vec3 hot = mix(bright, vec3(1.0), 0.4);
  vec3 col = mix(base, hot, clamp(arc * 0.8, 0.0, 1.0));

  // Whole-ring flicker on top of the lifetime fade (speed-scaled like the rest).
  float life = vAlpha * (0.75 + 0.25 * vnoise(tt * 30.0));
  fragColor = vec4(col, clamp(glow, 0.0, 1.0) * life);
}

// Sparkles — a firework burst: glints start at the center and ride outward
// with the expanding front (fixed positions in front-normalized space, so
// world position = normalized position · radius), reaching the cosmetic's
// full size at fade-out. One candidate glint per normalized grid cell
// (jittered but confined to its cell so each fragment samples only its own
// cell; the pitch vCell comes from the cosmetic's density). Glints keep a
// constant world size (hash-varied ±50% around vThickness, so thickness is
// the average sparkle size) once the burst outgrows the grid; while it's
// young they're capped to their cell, so the early burst reads as a dense
// compact cluster. Each glint twinkles on a hashed phase and takes a hashed
// palette color; the palette cycle advances at transitionSpeed steps/s on
// top of that offset.
void sparkles() {
  float cell = max(vCell, 0.001); // grid pitch (front-normalized units)
  // Rotate the grid off the world axes so the young, dense burst doesn't
  // read as a lattice (the disc cull below is rotation-invariant).
  const mat2 ROT = mat2(0.8253, -0.5646, 0.5646, 0.8253);
  vec2 gp = ROT * vLocalPos;
  vec2 cid = floor(gp / cell);
  float h1 = hash11(dot(cid, vec2(157.0, 113.0)) + 41.7);
  float h2 = hash11(h1 * 251.0 + 7.3);
  float h3 = hash11(h2 * 199.0 + 3.1);
  float h4 = hash11(h3 * 173.0 + 11.3);
  float h5 = hash11(h4 * 149.0 + 5.7);

  // Drop ~1/3 of cells — an organic scatter, not one glint per cell.
  if (h3 < 0.33) discard;

  // Glint radius: constant world size, hash-varied ±50% per glint so
  // vThickness is the AVERAGE sparkle size, and capped to its cell. The
  // jitter amplitude is fixed (cap + jitter = half a cell exactly) so glint
  // positions don't drift as the cap relaxes with the growing radius.
  float rs = min(
    0.5 * vThickness * (0.5 + h5) / max(vRadius, 0.001),
    0.35 * cell);
  vec2 center = (cid + 0.5) * cell + (vec2(h1, h2) - 0.5) * 0.3 * cell;

  // Glints outside the unit disc are culled so the burst stays circular.
  if (length(center) > 1.0) discard;

  // Hashed birth stagger so glints pop in over the first fifth of the life
  // instead of the whole disc appearing at once.
  float lifeT = 1.0 - vAlpha;
  float birth = smoothstep(h4 * 0.2, h4 * 0.2 + 0.08, lifeT);
  if (birth <= 0.0) discard;

  // Solid glint core with a thin anti-aliased rim — glints render fully
  // opaque (the twinkle modulates color brightness, not alpha), holding full
  // opacity through life and fading only over the last quarter.
  float g = clamp((1.0 - length(gp - center) / max(rs, 1e-4)) * 3.0, 0.0, 1.0);
  float tt = uTime * vSpeed;
  float tw = 0.35 +
             0.65 * pow(0.5 + 0.5 * sin(6.2832 * (h3 + tt * (1.5 + h1))), 2.0);
  float endFade = smoothstep(0.0, 0.25, vAlpha);

  float glow = g * birth * endFade;
  if (glow < 0.01) discard;

  // Whole palette steps per glint (floor) keep static colors exact; the cycle
  // blends between steps at transitionSpeed steps/s (0 = static hashed color,
  // negative = reverse), like the EMP base color.
  float idx = uTime * vTransSpeed + floor(h2 * vColorCount);
  vec3 base = mix(
    colorAt(mod(floor(idx), vColorCount)),
    colorAt(mod(floor(idx) + 1.0, vColorCount)),
    fract(idx));
  // Twinkle lives in the color: peaks flare toward white, troughs dim the
  // base — alpha stays saturated so the glints read solid.
  vec3 col = mix(base * (0.7 + 0.3 * tw), vec3(1.0), 0.5 * tw);

  fragColor = vec4(col, clamp(glow, 0.0, 1.0));
}

// Pixel ember splash (style 3). Top-down: chunky embers scattered on a stable
// world-space grid, thrown outward as the blast expands and cooling through the
// palette over the effect. A 2D grid (not angular sectors) — reads as a field
// of pixels, never radial rays. vThickness = ember block size (world tiles);
// vCell = keep-fraction (density-derived: the share of grid cells that light up).
void emberScatter() {
  float R = max(vRadius, 0.001);
  vec2 worldPos = vLocalPos * R; // tiles from the blast centre (grid is stable)
  float block = max(vThickness, 0.5); // chunky pixel size, world tiles
  // Rotate the grid off the world axes so it never reads as a lattice.
  const mat2 ROT = mat2(0.8253, -0.5646, 0.5646, 0.8253);
  vec2 cid = floor((ROT * worldPos) / block);
  float h1 = hash11(dot(cid, vec2(157.0, 113.0)) + 41.7);
  float h2 = hash11(h1 * 251.0 + 7.3);
  // Sparse: keep only a fraction of cells as embers (vCell = keep-fraction).
  if (h1 > clamp(vCell, 0.02, 1.0)) discard;

  // This cell's distance from the centre, front-normalised (0 = centre, 1 = rim).
  vec2 blockCentre = (cid + 0.5) * block;
  float distN = length(blockCentre) / R;
  if (distN > 1.0) discard;

  // Thrown outward as the blast expands: a cell only appears once the eased
  // front has reached its hashed range, so embers spread over the effect.
  float lifeT = 1.0 - vAlpha;
  float ease = 1.0 - (1.0 - lifeT) * (1.0 - lifeT);
  float reach = (0.15 + 0.85 * h2) * ease;
  if (distN > reach) discard;

  float a = smoothstep(0.0, 0.22, vAlpha); // fade over the last fifth of life
  if (a < 0.01) discard;

  // Cooling: hot (color 0) at birth -> cool (last color) as the blast ages,
  // posterised (one palette entry, no blend), with transitionSpeed cycling.
  float coolStep = lifeT * (vColorCount - 1.0);
  float idx = floor(coolStep + uTime * vTransSpeed);
  vec3 col = colorAt(mod(idx, vColorCount));
  fragColor = vec4(col, a);
}

// EMP bomb detonation (style 4). The quad spans the whole blast from the start
// (vRadius stays constant), so progress comes from the lifetime: a white
// flash, forked lightning crackling out to a jagged electric front, and a
// static field inside it that dies out. Bolts re-roll ~14 times a second,
// which is what makes them read as lightning rather than spokes.
void empBurst(float dist) {
  const float TAU = 6.28318;
  float t = 1.0 - vAlpha;
  float front = 1.0 - pow(1.0 - t, 3.0); // fast out, slow settle
  float R = max(vRadius, 0.001);
  float ang = atan(vLocalPos.y, vLocalPos.x);

  // White flash at the point of impact, gone within the first third.
  float flash = exp(-dist * 7.0) * (1.0 - smoothstep(0.0, 0.3, t)) * 1.6;

  // Jagged front, about two tiles thick, flickering along its length.
  float n = vnoise(ang * 7.0 + uTime * 9.0)
          + 0.5 * vnoise(ang * 19.0 - uTime * 15.0);
  float ringR = front * (0.93 + 0.05 * n);
  float halfW = (0.8 + 1.4 * vnoise(ang * 11.0 + uTime * 25.0)) / R;
  float ring = (1.0 - smoothstep(0.0, halfW, abs(dist - ringR)))
             * (1.0 - smoothstep(0.6, 1.0, t));

  // Forked bolts from the center to just behind the front.
  float seed = floor(uTime * 14.0);
  float bolts = 0.0;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float a0 = (fi + hash11(seed * 7.13 + fi * 13.7)) * (TAU / 7.0);
    float len = ringR * (0.7 + 0.3 * hash11(seed * 3.31 + fi * 5.9));
    float wander = (vnoise(dist * 9.0 + fi * 31.0 + seed * 1.7) - 0.5) * 0.9
                 + (vnoise(dist * 27.0 + fi * 17.0 + seed * 2.3) - 0.5) * 0.3;
    float d = mod(ang - a0 - wander * 0.7 + 3.14159, TAU) - 3.14159;
    float across = abs(d) * dist * R; // world tiles off the bolt
    float core = 1.0 - smoothstep(0.1, 0.5, across);
    float halo = (1.0 - smoothstep(0.0, 2.5, across)) * 0.3;
    bolts += (core + halo) * (1.0 - smoothstep(len - 0.05, len, dist));
  }
  bolts *= (0.65 + 0.35 * hash11(seed * 9.7))
         * (1.0 - smoothstep(0.4, 0.8, t));

  // Static field behind the front, crackling and dying out.
  vec2 world = vLocalPos * R; // tiles from the impact
  float crackle = vnoise2(world * 0.7 + vec2(uTime * 7.0, -uTime * 5.0));
  float field = (1.0 - smoothstep(ringR - 0.05, ringR, dist))
              * (0.07 + 0.2 * pow(crackle, 4.0))
              * (1.0 - smoothstep(0.35, 1.0, t));

  // Last sparks: a sparse scatter of round glints blinking out as the field
  // fades, one candidate per 2-tile cell.
  vec2 cid = floor(world / 2.0);
  float h = hash11(dot(cid, vec2(157.0, 113.0)) + seed * 0.37);
  float glint = 1.0 - smoothstep(0.15, 0.6, length(world - (cid + 0.5) * 2.0));
  float spark = step(0.95, h) * glint * step(dist, ringR)
              * smoothstep(0.3, 0.5, t) * (1.0 - smoothstep(0.75, 1.0, t));

  float glow = flash + ring * 1.1 + bolts + field + spark;
  if (glow < 0.01) discard;

  vec3 blue = vec3(0.30, 0.72, 1.00);
  vec3 violet = vec3(0.56, 0.46, 1.00);
  vec3 white = vec3(0.93, 0.97, 1.00);
  vec3 col = mix(blue, violet, 0.35 * vnoise(ang * 3.0 + uTime * 2.0));
  col = mix(col, white, clamp(flash + 0.5 * ring + 0.7 * bolts + spark, 0.0, 1.0) * 0.85);
  fragColor = vec4(col, clamp(glow, 0.0, 1.0));
}

void main() {
  float dist = length(vLocalPos);
  if (vStyle > 3.5) {
    empBurst(dist);
  } else if (vStyle > 2.5) {
    emberScatter();
  } else if (vStyle > 1.5) {
    sparkles();
  } else if (vStyle > 0.5) {
    empPulse(dist);
  } else {
    classicRing(dist);
  }
}
