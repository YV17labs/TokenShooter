/* ═══════════════════════════ Perception ═══════════════════════════
   What the robot's sensors report, as data. prompts.js turns it into the text sent to the model;
   the interface draws it on the map and on the floor. */

import { SIZE } from "./level.js";
import { DIRS, wallAt, idx, relative, lineOfSight, straightClear, freeCells, inView } from "./grid.js";
import { RULES } from "./rules.js";
import { isFree, seenRecently, lineOfFire } from "./world.js";
import { noisy } from "./monsters.js";

/* For each absolute direction, the walking distance to the nearest floor cell not seen
   recently whose shortest path starts that way (Infinity when there is none). Every cell is
   credited to a single direction: in an open room the sides are not all "unexplored" at once,
   which used to leave the model hesitating between turning left and right. */
function frontier(w) {
  const p = w.player, first = new Int8Array(SIZE * SIZE).fill(-1);
  const dist = new Int16Array(SIZE * SIZE).fill(-1), best = [Infinity, Infinity, Infinity, Infinity];
  const queue = [];
  dist[idx(p.x, p.y)] = 0;
  DIRS.forEach(([dx, dy], d) => {
    if (wallAt(p.x + dx, p.y + dy)) return;
    dist[idx(p.x + dx, p.y + dy)] = 1;
    first[idx(p.x + dx, p.y + dy)] = d;
    queue.push([p.x + dx, p.y + dy]);
  });
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i], k = idx(x, y), d = first[k];
    if (!seenRecently(w, x, y) && dist[k] < best[d]) best[d] = dist[k];
    for (const [dx, dy] of DIRS) {
      const nk = idx(x + dx, y + dy);
      if (wallAt(x + dx, y + dy) || dist[nk] >= 0) continue;
      dist[nk] = dist[k] + 1;
      first[nk] = d;
      queue.push([x + dx, y + dy]);
    }
  }
  return best;
}

/* Is there floor not seen recently beyond (x,y) in direction dir, without going back through
   the cells listed in `closed`? Used for the side openings along the way ahead. */
function unexplored(w, x, y, dir, closed = []) {
  const [dx, dy] = DIRS[dir];
  const start = [x + dx, y + dy];
  if (wallAt(...start)) return false;
  const visited = new Set([...closed, idx(...start)]);
  const queue = [[...start, 0]];
  while (queue.length) {
    const [cx, cy, d] = queue.shift();
    if (!seenRecently(w, cx, cy)) return true;
    if (d >= 12) continue;
    for (const [ex, ey] of DIRS) {
      const nx = cx + ex, ny = cy + ey;
      if (wallAt(nx, ny) || visited.has(idx(nx, ny))) continue;
      visited.add(idx(nx, ny));
      queue.push([nx, ny, d + 1]);
    }
  }
  return false;
}

function openingsAhead(w, n) {
  const p = w.player, [fx, fy] = DIRS[p.dir], out = [];
  // The way ahead is closed off, so an opening only reports what lies beyond it.
  const path = Array.from({ length: n + 1 }, (_, k) => idx(p.x + fx * k, p.y + fy * k));
  for (const [side, turn] of [["left", 3], ["right", 1]]) {
    const sideDir = (p.dir + turn) % 4, [sx, sy] = DIRS[sideDir];
    let wallBefore = !!wallAt(p.x + sx, p.y + sy);
    for (let k = 1; k <= n; k++) {
      const cx = p.x + fx * k, cy = p.y + fy * k;
      const open = !wallAt(cx + sx, cy + sy);
      if (open && wallBefore) {
        out.push({ side, in: k, x: cx + sx, y: cy + sy, unexplored: unexplored(w, cx, cy, sideDir, path) });
        break;
      }
      wallBefore = !open;
    }
  }
  return out.sort((a, b) => a.in - b.in);
}

/* A room contains at least one 2×2 block of floor; a corridor is one cell wide. */
function placeKind(w) {
  const p = w.player;
  for (const [ox, oy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]])
    if (!wallAt(p.x + ox, p.y + oy) && !wallAt(p.x + ox + 1, p.y + oy)
        && !wallAt(p.x + ox, p.y + oy + 1) && !wallAt(p.x + ox + 1, p.y + oy + 1)) return "room";
  const left = !wallAt(p.x + DIRS[(p.dir + 3) % 4][0], p.y + DIRS[(p.dir + 3) % 4][1]);
  const right = !wallAt(p.x + DIRS[(p.dir + 1) % 4][0], p.y + DIRS[(p.dir + 1) % 4][1]);
  return !left && !right ? "corridor" : "junction";
}

/* The move that brings an enemy into the line of fire, as an answer word. The robot must stand on
   the enemy's row or column with no wall between them, then face it: this takes the shortest
   walk to such a cell and returns its first move. The engine does the geometry so that the small
   model only has to follow the word, as with the unexplored area. Null when no cell will do. */
const LINE_UP = ["Forward", "Right", "Right", "Left"];     // by relative direction; behind: turn right
function lineUp(w, e) {
  const p = w.player, rel = d => (d - p.dir + 4) % 4;
  const lined = (x, y) => (x === e.x) !== (y === e.y)
    && Math.abs(x - e.x) + Math.abs(y - e.y) <= RULES.sightRange && straightClear(x, y, e.x, e.y);
  if (lined(p.x, p.y)) {
    const d = DIRS.findIndex(([dx, dy]) => dx === Math.sign(e.x - p.x) && dy === Math.sign(e.y - p.y));
    return rel(d) === 0 ? null : LINE_UP[rel(d)];
  }
  const visited = new Uint8Array(SIZE * SIZE), queue = [];
  visited[idx(p.x, p.y)] = 1;
  for (const turn of [0, 1, 3, 2]) {                       // ahead first: equal walks prefer no turn
    const d = (p.dir + turn) % 4, x = p.x + DIRS[d][0], y = p.y + DIRS[d][1];
    if (!isFree(w, x, y)) continue;
    visited[idx(x, y)] = 1;
    queue.push([x, y, d]);
  }
  for (let i = 0; i < queue.length; i++) {
    const [x, y, d] = queue[i];
    if (lined(x, y)) return LINE_UP[rel(d)];
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!isFree(w, nx, ny) || visited[idx(nx, ny)]) continue;
      visited[idx(nx, ny)] = 1;
      queue.push([nx, ny, d]);
    }
  }
  return null;
}

export function perceive(w) {
  const p = w.player;
  // Only the way to the nearest unexplored area is flagged ("nearest frontier" exploration):
  // with several flags at once the model hesitated and turned back and forth.
  const sides = {}, reach = frontier(w), nearest = Math.min(...reach);
  for (const [name, turn] of [["ahead", 0], ["right", 1], ["behind", 2], ["left", 3]]) {
    const dir = (p.dir + turn) % 4;
    const free = freeCells(p.x, p.y, dir);
    sides[name] = { free, unexplored: free > 0 && nearest < Infinity && reach[dir] === nearest };
  }

  const enemiesSeen = [], heard = [];
  for (const e of w.enemies) {
    if (!e.alive) continue;
    const r = relative(p, e.x, e.y), d = Math.hypot(r.f, r.l);
    if (d > RULES.sightRange || !lineOfSight(p.x, p.y, e.x, e.y)) continue;
    if (inView(r)) enemiesSeen.push({ id: e.id, kind: e.kind, x: e.x, y: e.y, ...r, d });
    // A monster charging or attacking is loud: it is heard from further away.
    else if (d <= RULES.hearingRange || noisy(w, e)) heard.push({ id: e.id, ...r, d });
  }
  enemiesSeen.sort((a, b) => a.d - b.d);
  heard.sort((a, b) => a.d - b.d);

  const itemsSeen = [];
  for (const it of w.items) {
    if (it.taken) continue;
    const r = relative(p, it.x, it.y), d = Math.hypot(r.f, r.l);
    if (inView(r) && d <= RULES.sightRange && lineOfSight(p.x, p.y, it.x, it.y))
      itemsSeen.push({ kind: it.kind, x: it.x, y: it.y, ...r, d });
  }
  itemsSeen.sort((a, b) => a.d - b.d);

  // An enemy in the line of fire is always in sight: the crosshair is its entry in enemiesSeen.
  const inLine = lineOfFire(w), crosshair = inLine ? enemiesSeen.find(e => e.id === inLine.id) : null;
  // With nothing in the line of fire, the nearest enemy perceived is the one to line up with.
  let target = null;
  if (!crosshair) {
    for (const e of [...enemiesSeen.map(e => ({ ...e, seen: true })), ...heard].sort((a, b) => a.d - b.d)) {
      const move = lineUp(w, w.enemies[e.id]);
      if (move) { target = { seen: !!e.seen, d: e.d, move }; break; }
    }
  }

  return {
    place: placeKind(w),
    sides,
    openings: openingsAhead(w, sides.ahead.free),
    crosshair, target,
    enemiesSeen, heard, itemsSeen,
    health: p.health, ammo: p.ammo,
    enemiesLeft: w.enemies.filter(e => e.alive).length,
    last: w.last,
    damage: w.damageSinceDecision,
  };
}
