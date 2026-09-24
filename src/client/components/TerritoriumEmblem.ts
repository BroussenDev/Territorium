import { html, LitElement, svg } from "lit";
import { customElement } from "lit/decorators.js";

// The emblem from brand/images/Favicon.svg as a tile grid: "T" tiles are
// territory, "C" is the gold capital, "." is empty.
const EMBLEM_ROWS = [
  "TTTTTTT",
  "TTTCTTT",
  "..TTT..",
  "..TTT..",
  "..TTT..",
  "..TTT..",
  "..TTT..",
  "..TTT..",
];

export interface EmblemTile {
  row: number;
  col: number;
  capital: boolean;
  /** Steps from the capital through neighbouring tiles; 0 for the capital. */
  step: number;
}

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
  while (queue.length > 0) {
    const [row, col] = queue.shift()!;
    const step = steps.get(`${row},${col}`)!;
    for (const [r, c] of [
      [row - 1, col],
      [row + 1, col],
      [row, col - 1],
      [row, col + 1],
    ]) {
      const cell = rows[r]?.[c];
      if (cell === undefined || cell === "." || steps.has(`${r},${c}`))
        continue;
      steps.set(`${r},${c}`, step + 1);
      queue.push([r, c]);
    }
  }
  const tiles: EmblemTile[] = [];
  rows.forEach((line, row) =>
    [...line].forEach((cell, col) => {
      if (cell === ".") return;
      tiles.push({
        row,
        col,
        capital: cell === "C",
        step: steps.get(`${row},${col}`) ?? 0,
      });
    }),
  );
  return tiles;
}

const PITCH = 7.07;
// The favicon's territory gradient (light top-left to deep bottom-right),
// sampled per tile rather than shared through a userSpaceOnUse gradient,
// which Chrome drops from the tiles mid-animation.
const TERRITORY_STOPS: [number, [number, number, number]][] = [
  [0, [0xa7, 0xf3, 0xd0]],
  [0.35, [0x34, 0xd3, 0x99]],
  [0.7, [0x10, 0xb9, 0x81]],
  [1, [0x04, 0x78, 0x57]],
];
const GRADIENT_END: [number, number] = [36, 54];
const SIZE = 5.57;
const STEP_DELAY_MS = 90;

function territoryColor(tile: EmblemTile): string {
  const [gx, gy] = GRADIENT_END;
  const x = tile.col * PITCH + SIZE / 2;
  const y = tile.row * PITCH + SIZE / 2;
  const t = Math.min(1, Math.max(0, (x * gx + y * gy) / (gx * gx + gy * gy)));
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

@customElement("territorium-emblem")
export class TerritoriumEmblem extends LitElement {
  createRenderRoot() {
    return this;
  }

  render() {
    const tiles = emblemTiles();
    return html`
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 48 55.1"
        class="block w-full h-auto overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="emblem-capital" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#fef3c7" />
            <stop offset=".5" stop-color="#fbbf24" />
            <stop offset="1" stop-color="#d97706" />
          </linearGradient>
        </defs>
        ${tiles.map(
          (t) => svg`
            <g
              class="emblem-tile"
              style="animation-delay: ${t.step * STEP_DELAY_MS}ms"
            >
              <rect
                x=${t.col * PITCH}
                y=${t.row * PITCH}
                width=${SIZE}
                height=${SIZE}
                rx="1.3"
                fill=${t.capital ? "url(#emblem-capital)" : territoryColor(t)}
              />
              <rect
                x=${t.col * PITCH}
                y=${t.row * PITCH}
                width=${SIZE}
                height="1.23"
                rx="1.3"
                fill="#fff"
                fill-opacity="0.22"
              />
            </g>
          `,
        )}
      </svg>
    `;
  }
}
