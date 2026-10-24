import { Cell, Game, NameViewData, Player } from "../../core/game/Game";
import { calculateBoundingBox } from "../../core/Util";

export interface Point {
  x: number;
  y: number;
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Spawn region diameter (see getSpawnTiles in SpawnExecution — euclidean
// radius 4). Used to size spawn-phase names directly off the spawn tile,
// instead of waiting on cluster recomputation.
const SPAWN_REGION_DIAMETER = 8;

/**
 * Place a player's name during the spawn phase using their currently-selected
 * spawn tile. Tracks re-rolls immediately, since spawnTile updates the same
 * tick the player picks a new location.
 */
export function placeSpawnName(game: Game, player: Player): NameViewData {
  const spawnTile = player.spawnTile();
  if (spawnTile === undefined) {
    return { x: 0, y: 0, size: 0 };
  }
  const fontSize = calculateFontSize(
    {
      x: 0,
      y: 0,
      width: SPAWN_REGION_DIAMETER,
      height: SPAWN_REGION_DIAMETER,
    },
    player.displayName(),
  );
  return {
    x: Math.ceil(game.x(spawnTile)),
    y: Math.ceil(game.y(spawnTile) - fontSize / 3),
    size: fontSize,
  };
}

export function placeName(game: Game, player: Player): NameViewData {
  const boundingBox =
    player.largestClusterBoundingBox ??
    calculateBoundingBox(game, player.borderTiles());

  let scalingFactor: number;
  const width = boundingBox.max.x - boundingBox.min.x;
  const height = boundingBox.max.y - boundingBox.min.y;
  const size = Math.min(width, height);
  if (size < 25) {
    scalingFactor = 1;
  } else if (size < 50) {
    scalingFactor = 2;
  } else if (size < 100) {
    scalingFactor = 4;
  } else if (size < 250) {
    scalingFactor = 8;
  } else if (size < 500) {
    scalingFactor = 16;
  } else {
    scalingFactor = 32;
  }

  const grid = createGrid(game, player, boundingBox, scalingFactor);
  const largestRectangle = findLargestInscribedRectangle(grid);
  largestRectangle.x = largestRectangle.x * scalingFactor;
  largestRectangle.y = largestRectangle.y * scalingFactor;
  largestRectangle.width = largestRectangle.width * scalingFactor;
  largestRectangle.height = largestRectangle.height * scalingFactor;

  let center = new Cell(
    Math.floor(
      largestRectangle.x + largestRectangle.width / 2 + boundingBox.min.x,
    ),
    Math.floor(
      largestRectangle.y + largestRectangle.height / 2 + boundingBox.min.y,
    ),
  );

  const fontSize = calculateFontSize(largestRectangle, player.displayName());
  center = new Cell(center.x, center.y - fontSize / 3);

  return {
    x: Math.ceil(center.x),
    y: Math.ceil(center.y),
    size: fontSize,
  };
}

// The grid a name is fitted into: width columns (x) by height rows (y),
// column-major (cell x, y at x * height + y), 1 where the name may sit.
export interface NameGrid {
  readonly cells: Uint8Array;
  readonly width: number;
  readonly height: number;
}

// Reused across calls: placing every player's name allocated a fresh grid
// per player (a quarter of the simulation's allocations).
let gridBuffer = new Uint8Array(0);
let heightsBuffer = new Int32Array(0);
let stackBuffer = new Int32Array(0);

export function createGrid(
  game: Game,
  player: Player,
  boundingBox: { min: Point; max: Point },
  scalingFactor: number,
): NameGrid {
  const minX = Math.floor(boundingBox.min.x / scalingFactor);
  const minY = Math.floor(boundingBox.min.y / scalingFactor);
  const maxX = Math.floor(boundingBox.max.x / scalingFactor);
  const maxY = Math.floor(boundingBox.max.y / scalingFactor);
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  if (gridBuffer.length < width * height) {
    gridBuffer = new Uint8Array(width * height * 2);
  }
  const cells = gridBuffer.subarray(0, width * height);
  cells.fill(0);
  const smallID = player.smallID();

  for (let x = minX; x <= maxX; x++) {
    const tx = x * scalingFactor;
    for (let y = minY; y <= maxY; y++) {
      const ty = y * scalingFactor;
      if (!game.isValidCoord(tx, ty)) continue;
      const tile = game.ref(tx, ty);
      if (
        game.isShore(tile) ||
        (game.isOcean(tile) && game.magnitude(tile) < 10) ||
        game.ownerID(tile) === smallID ||
        game.hasFallout(tile)
      ) {
        cells[(x - minX) * height + (y - minY)] = 1;
      }
    }
  }

  return { cells, width, height };
}

export function findLargestInscribedRectangle(grid: NameGrid): Rectangle {
  const { cells, width: cols, height: rows } = grid;
  if (heightsBuffer.length < cols) heightsBuffer = new Int32Array(cols * 2);
  if (stackBuffer.length < cols + 1) stackBuffer = new Int32Array(cols * 2 + 1);
  const heights = heightsBuffer;
  heights.fill(0, 0, cols);
  let bestX = 0;
  let bestY = 0;
  let bestWidth = 0;
  let bestHeight = 0;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      heights[col] = cells[col * rows + row] ? heights[col] + 1 : 0;
    }

    // Largest rectangle in the histogram of this row (see
    // largestRectangleInHistogram, same order and tie-breaking).
    const stack = stackBuffer;
    let top = 0;
    let maxArea = 0;
    let rx = 0;
    let rw = 0;
    let rh = 0;
    for (let i = 0; i <= cols; i++) {
      const h = i === cols ? 0 : heights[i];
      while (top > 0 && h < heights[stack[top - 1]]) {
        const barHeight = heights[stack[--top]];
        const barWidth = top === 0 ? i : i - stack[top - 1] - 1;
        if (barHeight * barWidth > maxArea) {
          maxArea = barHeight * barWidth;
          rx = top === 0 ? 0 : stack[top - 1] + 1;
          rw = barWidth;
          rh = barHeight;
        }
      }
      stack[top++] = i;
    }

    if (rw * rh > bestWidth * bestHeight) {
      bestX = rx;
      bestY = row - rh + 1;
      bestWidth = rw;
      bestHeight = rh;
    }
  }

  return { x: bestX, y: bestY, width: bestWidth, height: bestHeight };
}

export function largestRectangleInHistogram(widths: number[]): Rectangle {
  const stack: number[] = [];
  let maxArea = 0;
  let largestRect: Rectangle = { x: 0, y: 0, width: 0, height: 0 };

  for (let i = 0; i <= widths.length; i++) {
    const h = i === widths.length ? 0 : widths[i];

    while (stack.length > 0 && h < widths[stack[stack.length - 1]]) {
      const height = widths[stack.pop()!];
      const width = stack.length === 0 ? i : i - stack[stack.length - 1] - 1;

      if (height * width > maxArea) {
        maxArea = height * width;
        largestRect = {
          x: stack.length === 0 ? 0 : stack[stack.length - 1] + 1,
          y: 0,
          width: width,
          height: height,
        };
      }
    }

    stack.push(i);
  }

  return largestRect;
}

export function calculateFontSize(rectangle: Rectangle, name: string): number {
  // This is a simplified calculation. You might want to adjust it based on your specific font and rendering system.
  const widthConstrained = (rectangle.width / name.length) * 2;
  const heightConstrained = rectangle.height / 3;
  return Math.min(widthConstrained, heightConstrained);
}
