/* ═══════════════════════════ Fallback bot (no model) ═══════════════════════════
   Follows the same strategy as the one given to the model. It pilots when there is no model,
   and serves as the reference in the tests and the balance simulation. */

import { ACTIONS } from "./rules.js";
import { ANSWERS } from "./prompts.js";

export function heuristic(p, blocked = []) {
  const ok = a => !blocked.includes(a);
  let choice;
  const lineUp = p.target && ACTIONS[ANSWERS.indexOf(p.target.move)];
  if (p.crosshair && p.ammo > 0) choice = "Shoot";
  else if (lineUp && ok(lineUp)) choice = lineUp;
  else if (p.sides.ahead.unexplored && ok("Move forward")) choice = "Move forward";
  else if (p.sides.left.unexplored) choice = "Turn left";
  else if (p.sides.right.unexplored) choice = "Turn right";
  else if (p.openings.some(o => o.unexplored) && ok("Move forward")) choice = "Move forward";
  else if (p.sides.behind.unexplored) choice = "Turn right";
  else if (ok("Move forward") && p.sides.ahead.free > 1) choice = "Move forward";
  else choice = p.sides.left.free > p.sides.right.free ? "Turn left" : "Turn right";
  return Object.fromEntries(ACTIONS.map(a => [a, a === choice ? 0.8 : 0.05]));
}
