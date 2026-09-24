import { html, LitElement, svg } from "lit";
import { customElement } from "lit/decorators.js";

// The mark from brand/images/TerritoriumLogo.svg as a tile grid: "T" tiles are
// territory, "C" is the gold capital, "F" the frontier being claimed, "E" an
// enemy's land, "e" enemy land about to fall, "." is empty.
const EMBLEM_ROWS = [
  "TTTTTTT",
  "TTTCTTT",
  "..TTT..",
  "..TTT..",
  "..TTT..",
  "E.TTT.F",
  "EE.T.Fe",
];

export type EmblemTileKind =
  | "territory"
  | "capital"
  | "frontier"
  | "enemy"
  | "falling";

const KINDS: Record<string, EmblemTileKind> = {
  T: "territory",
  C: "capital",
  F: "frontier",
  E: "enemy",
  e: "falling",
};

export interface EmblemTile {
  row: number;
  col: number;
  kind: EmblemTileKind;
  /**
   * Steps from the capital through neighbouring territory; 0 for the
   * capital. Frontier and enemy tiles sit one step past the nearest tile
   * already counted, so the claim wave reaches them last.
   */
  step: number;
}

const isTerritory = (cell: string | undefined) => cell === "T" || cell === "C";

/**
 * The emblem's tiles, each with its distance from the capital, so the page
 * can claim them outward from it the way territory spreads in game.
 */
export function emblemTiles(
  rows: readonly string[] = EMBLEM_ROWS,
): EmblemTile[] {
  const steps = new Map<string, number>();
  const queue: [number, number][] = [];
  rows.forEach((line, row) =>
    [...line].forEach((cell, col) => {
      if (cell === "C") {
        steps.set(`${row},${col}`, 0);
        queue.push([row, col]);
      }
    }),
  );
  const neighbours = (row: number, col: number) => [
    [row - 1, col],
    [row + 1, col],
    [row, col - 1],
    [row, col + 1],
    [row - 1, col - 1],
    [row - 1, col + 1],
    [row + 1, col - 1],
    [row + 1, col + 1],
  ];
  while (queue.length > 0) {
    const [row, col] = queue.shift()!;
    const step = steps.get(`${row},${col}`)!;
    for (const [r, c] of neighbours(row, col).slice(0, 4)) {
      if (!isTerritory(rows[r]?.[c]) || steps.has(`${r},${c}`)) continue;
      steps.set(`${r},${c}`, step + 1);
      queue.push([r, c]);
    }
  }
  // Tiles outside the territory take the step after their closest
  // neighbour (diagonals included: the frontier touches the stem only by its
  // corners), relaxed until nothing gets closer.
  let changed = true;
  while (changed) {
    changed = false;
    rows.forEach((line, row) =>
      [...line].forEach((cell, col) => {
        if (cell === "." || isTerritory(cell)) return;
        const near = neighbours(row, col)
          .map(([r, c]) => steps.get(`${r},${c}`))
          .filter((s): s is number => s !== undefined);
        if (near.length === 0) return;
        const step = Math.min(...near) + 1;
        if (step < (steps.get(`${row},${col}`) ?? Infinity)) {
          steps.set(`${row},${col}`, step);
          changed = true;
        }
      }),
    );
  }
  const tiles: EmblemTile[] = [];
  rows.forEach((line, row) =>
    [...line].forEach((cell, col) => {
      if (cell === ".") return;
      tiles.push({
        row,
        col,
        kind: KINDS[cell],
        step: steps.get(`${row},${col}`) ?? 0,
      });
    }),
  );
  return tiles;
}

const ORIGIN = 9;
const PITCH = 6.77;
const SIZE = 5.37;
// The logo's territory gradient (light top-left to deep bottom-right),
// sampled per tile rather than shared through a userSpaceOnUse gradient,
// which Chrome drops from the tiles mid-animation.
const TERRITORY_STOPS: [number, [number, number, number]][] = [
  [0, [0xa7, 0xf3, 0xd0]],
  [0.35, [0x34, 0xd3, 0x99]],
  [0.7, [0x10, 0xb9, 0x81]],
  [1, [0x04, 0x78, 0x57]],
];
const GRADIENT_START: [number, number] = [8, 6];
const GRADIENT_END: [number, number] = [44, 60];
const STEP_DELAY_MS = 90;

function territoryColor(x: number, y: number): string {
  const [sx, sy] = GRADIENT_START;
  const gx = GRADIENT_END[0] - sx;
  const gy = GRADIENT_END[1] - sy;
  const t = Math.min(
    1,
    Math.max(0, ((x - sx) * gx + (y - sy) * gy) / (gx * gx + gy * gy)),
  );
  const i = Math.max(
    1,
    TERRITORY_STOPS.findIndex(([offset]) => offset >= t),
  );
  const [o1, c1] = TERRITORY_STOPS[i - 1];
  const [o2, c2] = TERRITORY_STOPS[i];
  const f = (t - o1) / (o2 - o1);
  const rgb = c1.map((c, k) => Math.round(c + (c2[k] - c) * f));
  return `rgb(${rgb.join(" ")})`;
}

function tile(t: EmblemTile) {
  const x = ORIGIN + t.col * PITCH;
  const y = ORIGIN + t.row * PITCH;
  const style = `--step: ${t.step}; --delay: ${t.step * STEP_DELAY_MS}ms`;
  if (t.kind === "frontier") {
    // Hollow: a border still being pushed. The fill rect claims it with each
    // wave, then gives it back.
    return svg`
      <g class="emblem-tile emblem-frontier" style=${style}>
        <rect x=${x + 0.6} y=${y + 0.6} width="4.17" height="4.17" rx="1.2"
          fill="#34d399" fill-opacity="0.18" stroke="#34d399"
          stroke-opacity="0.9" stroke-width="1.1" />
        <rect class="emblem-frontier-fill" x=${x} y=${y} width=${SIZE}
          height=${SIZE} rx="1.2" fill=${territoryColor(x + SIZE / 2, y + SIZE / 2)} />
      </g>
    `;
  }
  if (t.kind === "enemy" || t.kind === "falling") {
    return svg`
      <g class="emblem-tile emblem-${t.kind}" style=${style}>
        <rect x=${x} y=${y} width=${SIZE} height=${SIZE} rx="1.2"
          fill="#f43f5e" fill-opacity=${t.kind === "enemy" ? 0.85 : 0.4} />
      </g>
    `;
  }
  const capital = t.kind === "capital";
  return svg`
    <g class="emblem-tile ${capital ? "emblem-capital" : ""}" style=${style}>
      ${
        capital
          ? svg`<rect class="emblem-capital-halo" x=${x - 1.6} y=${y - 1.6}
              width=${SIZE + 3.2} height=${SIZE + 3.2} rx="2.4"
              fill="#fbbf24" />`
          : null
      }
      <rect x=${x} y=${y} width=${SIZE} height=${SIZE} rx="1.2"
        fill=${capital ? "url(#emblem-capital)" : territoryColor(x + SIZE / 2, y + SIZE / 2)} />
      <rect x=${x} y=${y} width=${SIZE} height="1.18" rx="1.2" fill="#fff"
        fill-opacity=${capital ? 0.5 : 0.22} />
      <rect class="emblem-glint" x=${x} y=${y} width=${SIZE} height=${SIZE}
        rx="1.2" fill="#fff" />
    </g>
  `;
}

/**
 * The home hero's emblem: the logo's mark, whose territory keeps spreading
 * out from the gold capital while the frontier is fought over.
 */
@customElement("territorium-emblem")
export class TerritoriumEmblem extends LitElement {
  createRenderRoot() {
    return this;
  }

  render() {
    return html`
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 64 64"
        class="block w-full h-auto overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="emblem-capital" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#fef3c7" />
            <stop offset=".5" stop-color="#fbbf24" />
            <stop offset="1" stop-color="#d97706" />
          </linearGradient>
          <radialGradient id="emblem-bg" cx=".5" cy=".3" r=".8">
            <stop offset="0" stop-color="#12302a" />
            <stop offset="1" stop-color="#070d0f" />
          </radialGradient>
        </defs>
        <rect
          x="1"
          y="1"
          width="62"
          height="62"
          rx="14"
          fill="url(#emblem-bg)"
        />
        <rect
          class="emblem-frame"
          x="1.5"
          y="1.5"
          width="61"
          height="61"
          rx="13.5"
          fill="none"
          stroke="#34d399"
          stroke-opacity=".35"
        />
        ${emblemTiles().map(tile)}
      </svg>
    `;
  }
}
