/* ═══════════════════════════ Monsters and fireballs ═══════════════════════════
   Everything that moves on its own. updateWorld advances it by dt seconds. */

import { SIZE } from "./level.js";
import { DIRS, wallAt, idx, touchesWall, lineOfSight, freeCells } from "./grid.js";
import { RULES, MONSTERS } from "./rules.js";
import { isFree, monsterEvent, checkEnd } from "./world.js";

/* Walking distance from the nearest of the source cells to every cell (-1: unreachable), never
   crossing the cell `skip`. */
function flood(sources, skip = -1) {
  const dist = new Int16Array(SIZE * SIZE).fill(-1), queue = [...sources];
  for (const [x, y] of sources) dist[idx(x, y)] = 0;
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy, k = idx(nx, ny);
      if (wallAt(nx, ny) || dist[k] >= 0 || k === skip) continue;
      dist[k] = dist[idx(x, y)] + 1;
      queue.push([nx, ny]);
    }
  }
  return dist;
}

/* Walls never move, so the maps only change when the robot changes cell: they are kept until then.
   dist: walking distance to the robot. firing(range): walking distance to the nearest firing
   position, a cell on the robot's row or column within range with no wall in between; ranged
   monsters use it to line up, as the robot must. */
export function paths(w) {
  const p = w.player, cell = idx(p.x, p.y);
  if (w.paths?.cell !== cell) w.paths = { cell, dist: flood([[p.x, p.y]]), firing: {} };
  return w.paths;
}

function firingMap(w, range) {
  const p = w.player, maps = paths(w);
  return maps.firing[range] ??= flood(DIRS.flatMap(([dx, dy], d) =>
    Array.from({ length: Math.min(range, freeCells(p.x, p.y, d)) }, (_, k) => [p.x + dx * (k + 1), p.y + dy * (k + 1)])),
    maps.cell);
}

export const noisy = (w, e) => e.charge > 0 || w.time - e.lastAttack < RULES.noiseMemory;

/* Doom rules: a monster sleeps until it sees the robot or hears a gunshot, then never lets go. */
export function wake(w, e) {
  if (e.awake) return;
  e.awake = true;
  w.events.push(monsterEvent(e, "wake"));
}

/* The last two monsters, or the nearest sleeper after too long without contact, come hunting on
   their own: every game ends with a fight. */
function rouse(w, dist) {
  const alive = w.enemies.filter(e => e.alive), asleep = alive.filter(e => !e.awake);
  if (!asleep.length) return;
  if (alive.length <= 2) { for (const e of asleep) wake(w, e); return; }
  if (w.time - w.lastContact < RULES.patience) return;
  const reachable = asleep.filter(e => dist[idx(e.x, e.y)] >= 0);
  if (!reachable.length) return;
  wake(w, reachable.sort((a, b) => dist[idx(a.x, a.y)] - dist[idx(b.x, b.y)])[0]);
  w.lastContact = w.time;
}

/* (x, y): where the blow came from. */
function hurt(w, amount, x, y) {
  const p = w.player;
  p.health = Math.max(0, p.health - amount);
  w.damageSinceDecision += amount;
  w.stats.damageTaken += amount;
  w.events.push({ type: "hurt", amount, x, y });
}

/* The monster reserves its next cell at once and glides there over `time` seconds. */
function glide(e, x, y, time) {
  e.fromX = e.x; e.fromY = e.y;
  e.x = x; e.y = y;
  e.step = e.stepTime = time;
}

/* One step down the walking distance to the robot. Blocked by another monster, it waits. */
function chase(w, e, dist, time) {
  const p = w.player;
  let best = null;
  for (const [dx, dy] of DIRS) {
    const nx = e.x + dx, ny = e.y + dy, dd = dist[idx(nx, ny)];
    if (dd < 0 || !isFree(w, nx, ny) || (nx === p.x && ny === p.y)) continue;
    if (!best || dd < best.dd) best = { nx, ny, dd };
  }
  if (best && best.dd < dist[idx(e.x, e.y)]) glide(e, best.nx, best.ny, time);
  else glide(e, e.x, e.y, 0.25);
}

/* Asleep, a monster drifts around its home cell. */
function patrol(w, e, dt) {
  e.wait -= dt;
  if (e.wait > 0) return;
  const p = w.player;
  const options = DIRS.map(([dx, dy]) => [e.x + dx, e.y + dy]).filter(([nx, ny]) =>
    isFree(w, nx, ny) && !(nx === p.x && ny === p.y)
    && Math.abs(nx - e.homeX) + Math.abs(ny - e.homeY) <= 2);
  if (options.length) glide(e, ...options[Math.floor(w.random() * options.length)], MONSTERS[e.kind].step * 1.8);
  e.wait = 2 + w.random() * 2;
}

/* Like the robot's shots, fireballs fly along a row or a column: the watcher aims when it starts
   charging, so a robot that steps out of the line in time dodges the fireball. */
function launch(w, e) {
  const [dx, dy] = e.aim;
  w.projectiles.push({ id: w.nextProjectile++, x: e.x, y: e.y, dx, dy, damage: MONSTERS[e.kind].damage });
  e.lastAttack = w.time;
  w.events.push(monsterEvent(e, "fireball"));
}

function updateMonster(w, e, dt, dist) {
  const p = w.player, m = MONSTERS[e.kind];
  e.step = Math.max(0, e.step - dt);
  e.cooldown = Math.max(0, e.cooldown - dt);
  e.pain = Math.max(0, e.pain - dt);
  const d = Math.hypot(e.x - p.x, e.y - p.y);
  const sees = d <= RULES.sightRange && lineOfSight(e.x, e.y, p.x, p.y);
  if (sees) { wake(w, e); w.lastContact = w.time; }
  if (e.pain > 0 || e.step > 0) return;              // flinching, or still gliding to its cell

  if (e.charge > 0) {                                 // winding up a fireball: it holds still
    e.charge = Math.max(0, e.charge - dt);
    if (e.charge === 0) {
      launch(w, e);
      e.cooldown = m.cooldown;
    }
    return;
  }

  const adjacent = Math.abs(e.x - p.x) + Math.abs(e.y - p.y) === 1;
  if (m.firstBite && adjacent) {                      // melee: bites once next to the robot
    if (!e.biting) { e.biting = true; e.cooldown = Math.max(e.cooldown, m.firstBite); }
    if (e.cooldown === 0) {
      hurt(w, m.damage, e.x, e.y);
      e.cooldown = m.cooldown;
      e.lastAttack = w.time;
      w.events.push(monsterEvent(e, "bite"));
    }
    return;
  }
  e.biting = false;

  if (!e.awake) { patrol(w, e, dt); return; }
  if (m.range) {                                      // ranged: lines up with the robot, then fires
    const firing = firingMap(w, m.range);
    if (firing[idx(e.x, e.y)] === 0) {
      if (e.cooldown === 0) {
        e.aim = [Math.sign(p.x - e.x), Math.sign(p.y - e.y)];
        e.charge = m.charge;
        w.events.push(monsterEvent(e, "charge", { time: m.charge }));
      }
      return;
    }
    if (firing[idx(e.x, e.y)] > 0) { chase(w, e, firing, m.step); return; }
  }
  chase(w, e, dist, m.dash && sees && d <= m.dashRange ? m.dash : m.step);
}

/* Fireballs fly until they hit the robot or a wall; the maze is walled all round. */
function updateProjectiles(w, dt) {
  const p = w.player, n = Math.ceil(RULES.fireballSpeed * dt / 0.1);   // sub-steps: no tunnelling
  const move = RULES.fireballSpeed * dt / n;
  w.projectiles = w.projectiles.filter(b => {
    for (let i = 0; i < n; i++) {
      b.x += b.dx * move;
      b.y += b.dy * move;
      if (Math.hypot(b.x - p.x, b.y - p.y) < 0.45) {
        hurt(w, b.damage, b.x - b.dx, b.y - b.dy);                   // from one cell back along its path
        w.events.push({ type: "impact", x: b.x, y: b.y, hit: true });
        return false;
      }
      if (touchesWall(b.x, b.y, 0.08)) {
        w.events.push({ type: "impact", x: b.x - b.dx * 0.06, y: b.y - b.dy * 0.06, hit: false });
        return false;
      }
    }
    return true;
  });
}

export function updateWorld(w, dt) {
  if (w.state !== "playing") return;
  w.time += dt;
  const dist = paths(w).dist;
  for (const e of w.enemies) if (e.alive) updateMonster(w, e, dt, dist);
  rouse(w, dist);
  updateProjectiles(w, dt);
  checkEnd(w);
}
