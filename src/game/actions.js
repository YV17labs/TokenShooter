/* ═══════════════════════════ Actions ═══════════════════════════
   What the pilot does: move, turn, shoot. Each call applies one action at once; the interface
   then waits ACTION_TIME for the view to catch up. */

import { DIRS, idx, freeCells } from "./grid.js";
import { RULES, MONSTERS } from "./rules.js";
import { isFree, lineOfFire, markSeen, checkEnd, monsterEvent } from "./world.js";
import { paths, wake } from "./monsters.js";

export function blockedActions(w) {
  const p = w.player, out = [];
  const [fx, fy] = DIRS[p.dir];
  if (!isFree(w, p.x + fx, p.y + fy)) out.push("Move forward");
  if (p.ammo <= 0) out.push("Shoot");
  return out;
}

function pickUp(w) {
  const p = w.player;
  for (const it of w.items) {
    if (it.taken || it.x !== p.x || it.y !== p.y) continue;
    if (it.kind === "ammo") p.ammo += RULES.ammoPickup;
    else if (p.health < RULES.health) p.health = Math.min(RULES.health, p.health + RULES.healthPickup);
    else continue;                                    // full health: leave the pack for later
    it.taken = true;
    w.events.push({ type: "pickup", item: it.id, kind: it.kind, x: it.x, y: it.y });
  }
}

export function applyAction(w, action) {
  if (w.state !== "playing") return;
  const p = w.player;
  const [fx, fy] = DIRS[p.dir];
  let result = null;
  if (blockedActions(w).includes(action)) {
    result = "impossible";
  } else if (action === "Move forward") {
    p.x += fx; p.y += fy;
    pickUp(w);
  } else if (action === "Turn left") {
    p.dir = (p.dir + 3) % 4;
  } else if (action === "Turn right") {
    p.dir = (p.dir + 1) % 4;
  } else if (action === "Shoot") {
    p.ammo--;
    w.stats.shots++;
    const e = lineOfFire(w);
    if (e) {
      e.health -= RULES.shotDamage;
      w.stats.hits++;
      let flinched = false;
      if (e.health <= 0) { e.alive = false; w.stats.kills++; result = "enemy destroyed"; }
      else {
        result = "hit";
        // Doom's pain chance: a hit does not always make the monster flinch and lose its attack.
        flinched = w.random() < MONSTERS[e.kind].painChance;
        if (flinched) { e.pain = RULES.pain; e.charge = 0; }
        wake(w, e);
      }
      w.events.push(monsterEvent(e, "shot", { hit: true, killed: !e.alive, flinched }));
    } else {
      const n = freeCells(p.x, p.y, p.dir);             // impact on the face of the first wall
      w.events.push({ type: "shot", hit: false, x: p.x + fx * (n + 0.5), y: p.y + fy * (n + 0.5) });
      result = "missed, ammo wasted";
    }
    // As in Doom, gunfire wakes up every monster within earshot.
    const dist = paths(w).dist;
    for (const e of w.enemies)
      if (e.alive && dist[idx(e.x, e.y)] >= 0 && dist[idx(e.x, e.y)] <= RULES.gunshotRange) wake(w, e);
  }
  w.last = { action, result };
  markSeen(w);
  checkEnd(w);
}
