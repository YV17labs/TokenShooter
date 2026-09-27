/* ═══════════════════════════ Headless games ═══════════════════════════
   A whole game without a page, in a fraction of a second: for the tests and `npm run simulate`.
   It follows the page's decision loop: perceive, think for `latency` seconds (the monsters keep
   moving in real time), act, then let the world run for as long as the action takes. */

import { ACTIONS, ACTION_TIME } from "./rules.js";
import { createWorld } from "./world.js";
import { updateWorld } from "./monsters.js";
import { blockedActions, applyAction } from "./actions.js";
import { perceive } from "./perception.js";
import { heuristic } from "./bot.js";

const DT = 1 / 60;

function run(w, seconds) {
  for (let t = 0; t < seconds - 1e-9; t += DT) updateWorld(w, Math.min(DT, seconds - t));
}

/* `policy(perception, blocked)` returns a probability per action; the rule-based bot by default. */
export function play(seed, { latency = 0, live = false, maxTime = 400, policy = heuristic } = {}) {
  const w = createWorld(seed);
  const ev = { wake: 0, fireball: 0, bite: 0, hurt: 0, impactHit: 0 };
  let firstContact = null;
  while (w.state === "playing" && w.time < maxTime) {
    const p = perceive(w);
    w.damageSinceDecision = 0;
    if (live) run(w, latency);
    if (w.state !== "playing") break;
    const blocked = blockedActions(w);
    const probs = policy(p, blocked);
    let choice = null;
    for (const a of ACTIONS) if (!blocked.includes(a) && (!choice || probs[a] > probs[choice])) choice = a;
    choice ??= "Turn right";
    w.stats.decisions++;
    applyAction(w, choice);
    run(w, ACTION_TIME[choice]);
    for (const e of w.events.splice(0)) {
      if (e.type in ev) ev[e.type]++;
      if (e.type === "impact" && e.hit) ev.impactHit++;
      if (e.type === "hurt" && firstContact === null) firstContact = w.time;
    }
  }
  return { state: w.state, time: w.time, health: w.player.health, ammo: w.player.ammo, ...w.stats, ev, firstContact };
}
