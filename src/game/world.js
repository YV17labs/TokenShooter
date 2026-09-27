/* ═══════════════════════════ World state ═══════════════════════════
   A world is a plain object: the player, the monsters, the items, the fireballs in flight, what
   has been seen and when, and the events the interface has not consumed yet. */

import { MAP, SIZE, STARTS, KINDS } from "./level.js";
import { DIRS, wallAt, idx, relative, lineOfSight, inView } from "./grid.js";
import { RULES, MONSTERS } from "./rules.js";

export const enemyAt = (w, x, y) => w.enemies.find(e => e.alive && e.x === x && e.y === y);
export const isFree = (w, x, y) => !wallAt(x, y) && !enemyAt(w, x, y);

/* An event about a monster: which one, and the cell it stands on (or is gliding to). */
export const monsterEvent = (e, type, extra) => ({ type, enemy: e.id, kind: e.kind, x: e.x, y: e.y, ...extra });

/* Seeded pseudo-random generator: a game replays identically. */
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createWorld(seed = 7) {
  const w = {
    player: null, enemies: [], items: [], projectiles: [], nextProjectile: 0,
    seen: new Float64Array(SIZE * SIZE).fill(-Infinity),   // when each cell was last seen
    time: 0, lastContact: 0, state: "playing", events: [],
    last: null, damageSinceDecision: 0,
    stats: { decisions: 0, shots: 0, hits: 0, kills: 0, damageTaken: 0 },
    random: mulberry32(seed),
  };
  MAP.forEach((row, y) => [...row].forEach((c, x) => {
    if (c in STARTS) w.player = { x, y, dir: STARTS[c], health: RULES.health, ammo: RULES.ammo };
    else if (c in KINDS) w.enemies.push({
      id: w.enemies.length, kind: KINDS[c], x, y, fromX: x, fromY: y, homeX: x, homeY: y,
      health: MONSTERS[KINDS[c]].health, alive: true, awake: false,
      step: 0, stepTime: 1,               // gliding from (fromX, fromY) to (x, y): time left, total
      wait: 1 + w.random() * 2, cooldown: 0, charge: 0, pain: 0, biting: false, lastAttack: -Infinity,
    });
    else if (c === "a") w.items.push({ id: w.items.length, kind: "ammo", x, y, taken: false });
    else if (c === "+") w.items.push({ id: w.items.length, kind: "health pack", x, y, taken: false });
  }));
  if (!w.player) throw new Error("MAP: no player start (> v < ^)");
  markSeen(w);
  return w;
}

/* A world set up for one precise situation (worked examples and tests). */
export function scenario({ x, y, dir, enemies = [], explored = true, unexploredAreas = [], ammo, health, last }) {
  const w = createWorld();
  Object.assign(w.player, { x, y, dir });
  if (ammo !== undefined) w.player.ammo = ammo;
  if (health !== undefined) w.player.health = health;
  w.enemies.forEach((e, i) => {
    e.alive = i < enemies.length;
    if (e.alive) { [e.x, e.y] = enemies[i]; e.fromX = e.x; e.fromY = e.y; }
  });
  w.time = 100;
  if (explored) w.seen.fill(w.time);
  for (const [x0, y0, x1, y1] of unexploredAreas)
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) w.seen[idx(xx, yy)] = -Infinity;
  w.last = last || null;
  return w;
}

/* Cells actually seen: field of view with line of sight, plus the adjacent cells. */
export function markSeen(w) {
  const p = w.player;
  w.seen[idx(p.x, p.y)] = w.time;
  for (const [dx, dy] of DIRS) if (!wallAt(p.x + dx, p.y + dy)) w.seen[idx(p.x + dx, p.y + dy)] = w.time;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (wallAt(x, y)) continue;
    const r = relative(p, x, y);
    if (inView(r) && Math.hypot(r.f, r.l) <= RULES.sightRange && lineOfSight(p.x, p.y, x, y))
      w.seen[idx(x, y)] = w.time;
  }
}

/* After RULES.memory seconds an area counts as unexplored again: enemies may have moved. */
export const seenRecently = (w, x, y) => w.time - w.seen[idx(x, y)] <= RULES.memory;

/* Shots fly straight ahead along the robot's row or column: they hit the first enemy on that
   line, unless a wall comes first. */
export function lineOfFire(w) {
  const p = w.player, [dx, dy] = DIRS[p.dir];
  for (let k = 1; k <= RULES.sightRange; k++) {
    if (wallAt(p.x + dx * k, p.y + dy * k)) return null;
    const e = enemyAt(w, p.x + dx * k, p.y + dy * k);
    if (e) return e;
  }
  return null;
}

export function checkEnd(w) {
  if (w.state !== "playing") return;
  if (w.player.health <= 0) w.state = "lost";
  else if (w.enemies.every(e => !e.alive)) w.state = "won";
  if (w.state !== "playing") w.events.push({ type: "end", result: w.state });
}
