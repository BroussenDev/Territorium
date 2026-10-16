/**
 * Which way a warship points. Its sprite is drawn twice, bow up and bow up
 * to the right; the shader turns them by quarter turns, so the eight
 * headings stay pixel-crisp (no blurry free rotation).
 *
 * Headings run clockwise from north: 0 north, 1 north-east, 2 east, ...
 * 7 north-west. Map y grows southward.
 */

/** The heading from `from` to `to` (tile indexes), or `previous` when still. */
export function warshipHeading(
  from: number,
  to: number,
  mapWidth: number,
  previous: number,
): number {
  if (from === to) return previous;
  const dx = (to % mapWidth) - (from % mapWidth);
  const dy = Math.floor(to / mapWidth) - Math.floor(from / mapWidth);
  // atan2 with north = 0 and angles growing clockwise.
  const angle = Math.atan2(dx, -dy);
  return (Math.round(angle / (Math.PI / 4)) + 8) % 8;
}

/** A heading for a ship never seen moving: spread, so a fleet isn't in step. */
export function initialWarshipHeading(unitId: number): number {
  return ((unitId * 2654435761) >>> 0) % 8;
}

/** The sprite for a heading: the diagonal one or not, and quarter turns. */
export function warshipSprite(heading: number): {
  diagonal: boolean;
  quarterTurns: number;
} {
  return { diagonal: heading % 2 === 1, quarterTurns: Math.floor(heading / 2) };
}

/**
 * Moves a heading is taken over. Ships move one tile a tick, along rows and
 * columns only, so a diagonal course is a staircase: over one step the ship
 * would twitch between two headings and never show the diagonal.
 */
export const COURSE_STEPS = 8;

/** Each warship's recent track, and the heading it gives. */
export class WarshipCourses {
  private readonly courses = new Map<
    number,
    { trail: number[]; heading: number }
  >();
  private readonly seen = new Set<number>();

  /** The heading of ship `id`, now at tile `pos`. */
  heading(id: number, pos: number, mapWidth: number): number {
    this.seen.add(id);
    let course = this.courses.get(id);
    if (course === undefined) {
      course = { trail: [pos], heading: initialWarshipHeading(id) };
      this.courses.set(id, course);
      return course.heading;
    }
    if (course.trail[course.trail.length - 1] !== pos) {
      course.trail.push(pos);
      if (course.trail.length > COURSE_STEPS + 1) course.trail.shift();
      course.heading = warshipHeading(
        course.trail[0],
        pos,
        mapWidth,
        course.heading,
      );
    }
    return course.heading;
  }

  /** Forgets the ships not seen since the last sweep (sunk, or gone). */
  sweep(): void {
    for (const id of this.courses.keys()) {
      if (!this.seen.has(id)) this.courses.delete(id);
    }
    this.seen.clear();
  }
}
