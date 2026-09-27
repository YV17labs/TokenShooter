/* ═══════════════════════════ Grid ═══════════════════════════
   Every position in the game, and in the events it sends, is in cells: (x, y) is the centre of
   cell (x, y), which spans half a cell around it. The robot and the monsters sit on those centres,
   fireballs move continuously between them. Only the renderers shift by half a cell. */

import { MAP, SIZE } from "./level.js";

export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // north, east, south, west (y points down)

export const wallAt = (x, y) =>
  (x < 0 || y < 0 || x >= SIZE || y >= SIZE) ? "1"
  : ("1234".includes(MAP[y][x]) ? MAP[y][x] : null);

export const idx = (x, y) => y * SIZE + x;

/* Coordinates relative to where the player faces: f cells ahead (negative = behind),
   l cells to the right (negative = to the left). */
export function relative(p, x, y) {
  const [fx, fy] = DIRS[p.dir], [rx, ry] = DIRS[(p.dir + 1) % 4];
  const dx = x - p.x, dy = y - p.y;
  return { f: dx * fx + dy * fy, l: dx * rx + dy * ry };
}

/* Does a disc of radius r centred on (x, y) touch a wall? A point belongs to the nearest cell centre. */
export const touchesWall = (x, y, r) =>
  !!(wallAt(Math.round(x - r), Math.round(y - r)) || wallAt(Math.round(x + r), Math.round(y - r))
     || wallAt(Math.round(x - r), Math.round(y + r)) || wallAt(Math.round(x + r), Math.round(y + r)));

/* Line of sight between two cell centres, finely sampled. The line has a little thickness, so it
   cannot slip between two walls that touch at a corner: the 3D view shows no gap there. Walls
   never change, so each pair of cells is computed once (0 unknown, 1 clear, 2 blocked). */
const sightCache = new Uint8Array(SIZE ** 4);
export function lineOfSight(x0, y0, x1, y1) {
  const key = idx(x0, y0) * SIZE * SIZE + idx(x1, y1);
  if (!sightCache[key]) {
    const dx = x1 - x0, dy = y1 - y0, n = Math.ceil(Math.hypot(dx, dy) * 8);
    let clear = true;
    for (let i = 1; i < n && clear; i++)
      clear = !touchesWall(x0 + dx * i / n, y0 + dy * i / n, 0.1);
    sightCache[key] = clear ? 1 : 2;
  }
  return sightCache[key] === 1;
}

/* Two cells on the same row or column with no wall between them. */
export function straightClear(x0, y0, x1, y1) {
  if (x0 !== x1 && y0 !== y1) return false;
  const n = Math.abs(x1 - x0) + Math.abs(y1 - y0), sx = Math.sign(x1 - x0), sy = Math.sign(y1 - y0);
  for (let k = 1; k < n; k++) if (wallAt(x0 + sx * k, y0 + sy * k)) return false;
  return true;
}

export function freeCells(x, y, dir) {
  const [dx, dy] = DIRS[dir];
  let n = 0;
  while (!wallAt(x + dx * (n + 1), y + dy * (n + 1))) n++;
  return n;
}

/* The field of view is 90°: visible when |l| ≤ f. The 3D camera uses exactly this field. */
export const inView = r => r.f >= 1 && Math.abs(r.l) <= r.f;
