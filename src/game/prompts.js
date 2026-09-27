/* ═══════════════════════════ Text sent to the model ═══════════════════════════
   The perception as text, the system prompt and the worked examples. Every wording choice here
   was measured on the small Qwen models: see the comments before changing one. */

import { scenario } from "./world.js";
import { perceive } from "./perception.js";

/* The model answers with a word rather than a letter: small models are poor at binding a
   letter to an option. Each word starts with a distinct token. */
export const ANSWERS = ["Forward", "Left", "Right", "Shoot"];

/* Small models tend to copy words from the prompt into their answer. The direction lines are
   therefore named after the actions (Forward, Left, Right) and the other lines avoid the words
   "left" and "right" unless they point to the right turn. */
const cells = n => `${n} cell${n > 1 ? "s" : ""}`;

const sideText = s => s.free === 0 ? "wall." : `${cells(s.free)} free then a wall.`;

/* One line names the way to the nearest unexplored area with the very word of the answer
   (Forward, Left, Right): with a flag on each direction line, the 2B model picked up the word
   "unexplored" but not which line carried it, and turned back and forth for minutes. */
function unexploredText(sides) {
  const ways = [["ahead", "Forward"], ["left", "Left"], ["right", "Right"], ["behind", "Behind"]]
    .filter(([side]) => sides[side].unexplored).map(([, word]) => word);
  return ways.length ? `Unexplored area: ${ways.join(" or ")}.` : "Unexplored area: none, everything was seen recently.";
}

export const distance = r => cells(Math.max(1, Math.round(Math.hypot(r.f, r.l))));

const closeness = d => d <= 1 ? "adjacent" : d <= 3 ? "very close" : d <= 6 ? "a few cells away" : "far away";

function itemText(it) {
  if (it.l === 0) return `${it.kind}, ${cells(it.f)} straight ahead`;
  return `${it.kind}, ${distance(it)} away`;
}

export function describe(p) {
  const l = [];
  l.push(`Place: ${p.place}.`);
  // An enemy in the line of fire stands in the way: "cells free" there pulled the model forward.
  l.push(`Forward: ${p.crosshair ? `enemy, ${distance(p.crosshair)} ahead.` : sideText(p.sides.ahead)}`);
  l.push(`Left: ${sideText(p.sides.left)}`);
  l.push(`Right: ${sideText(p.sides.right)}`);
  l.push(`Behind: ${sideText(p.sides.behind)}`);
  // Side openings further ahead are drawn on the map and the floor but not described: the words
  // "left" and "right" in that line pulled the model into turning too early.
  if (p.itemsSeen.length) l.push(`Items in sight: ${p.itemsSeen.slice(0, 2).map(itemText).join("; ")}.`);

  l.push(`Health ${p.health}/100, ammo ${p.ammo}, enemies left ${p.enemiesLeft}.`);
  // Only outcomes are reported. Echoing the last move ("Turn right") makes small models repeat
  // it: in testing the robot span in place while an enemy hit it.
  if (p.last?.action === "Shoot" && p.last.result) l.push(`Last shot: ${p.last.result}.`);
  if (p.damage > 0) l.push(`You lost ${p.damage} health since your last action.`);
  // Exploration memory is only recalled when no threat is perceived: during a fight it pulled
  // the small model away from shooting.
  if (!p.crosshair && !p.target) l.push(unexploredText(p.sides));

  // Threats last, right before the question: small models weigh the latest lines the most
  // (measured: moving them to the top made the 0.8B model stop shooting altogether).
  if (p.crosshair) {
    if (p.enemiesSeen.length > 1) l.push(`Other enemies in sight: ${p.enemiesSeen.length - 1}.`);
    // Named with the answer word, like the other targets: without it the 0.8B model shot only
    // about half the time and walked toward the enemy instead (measured on 50 situations).
    l.push(`Crosshair: ENEMY, ${distance(p.crosshair)} away. Shoot.`);
  } else {
    // The move is named with the answer word itself, like the unexplored area.
    if (p.target) l.push(`Enemy ${p.target.seen ? "in sight" : "heard"}, ${closeness(p.target.d)}, off the line of fire. To line up: ${p.target.move}.`);
    l.push("Crosshair: empty.");
  }
  return l.join("\n");
}

/* The same situation seen in a mirror: left and right swap. The brain scores both versions
   and averages them, which cancels the model's own left/right bias (see brain/worker.js). Only
   what describe() reads is mirrored: the side distances and the move to line up. */
const MIRRORED = { Left: "Right", Right: "Left" };
const mirrorWord = a => MIRRORED[a] || a;
export function mirror(p) {
  return {
    ...p,
    sides: { ...p.sides, left: p.sides.right, right: p.sides.left },
    target: p.target && { ...p.target, move: mirrorWord(p.target.move) },
  };
}

/* Answer index → index of the same answer in the mirrored world (Left ↔ Right). */
export const MIRRORED_ANSWER = ANSWERS.map(a => ANSWERS.indexOf(mirrorWord(a)));

/* ═══════════════════════════ Prompts ═══════════════════════════ */

/* Editable from the UI. The rest of the system prompt describes the actions, which do not
   change. */
export const STRATEGY = `Strategy, in order of priority:
1. Crosshair shows an ENEMY: Shoot.
2. Crosshair empty and an enemy off the line of fire: Left if To line up is Left, Right if it is Right, Forward if it is Forward.
3. Crosshair empty: never Shoot.
4. Otherwise explore toward the unexplored area: Forward if it is Forward, Left if it is Left, Right if it is Right or Behind.
5. When no area is unexplored: go Forward if it is free, else turn toward the side with more free cells. Never turn toward a wall.
6. Low health or ammo: go toward the items in sight.`;

export function systemPrompt(strategy = STRATEGY) {
  return `You pilot a robot through a maze, seen in first person. The world is a grid: each action moves one cell or turns 90 degrees.
Each turn you receive what your sensors perceive, then you answer with one action:
- Forward: move one cell ahead (impossible when Forward is a wall).
- Left: turn 90 degrees to the left, to face the Left direction.
- Right: turn 90 degrees to the right, to face the Right direction.
- Shoot: fire at the enemy in the crosshair. With no enemy in the crosshair, the ammo is wasted.

${strategy.trim()}

Answer with a single word: Forward, Left, Right or Shoot.`;
}

export const userPrompt = state => `${state}\n\nYour action?`;

/* Balanced on purpose (four of each answer) so the examples do not tilt the model toward one
   word. They cover shooting, lining up with an enemy heard to the side or behind, and exploring.
   The enemy at (1, 1) in exploration examples is out of sight: it only counts as "enemies left". */
export const EXAMPLES = [
  ["Shoot", { x: 12, y: 15, dir: 3, enemies: [[9, 15]] }],
  ["Right", { x: 15, y: 3, dir: 2, enemies: [[11, 3]] }],
  ["Forward", { x: 11, y: 14, dir: 0, enemies: [[1, 1]], explored: false }],
  ["Left", { x: 9, y: 15, dir: 2, enemies: [[11, 15]] }],
  ["Left", { x: 11, y: 9, dir: 0, enemies: [[1, 1]], unexploredAreas: [[13, 1, 15, 3]] }],
  ["Forward", { x: 10, y: 5, dir: 3, enemies: [[1, 1]], explored: false,
                last: { action: "Shoot", result: "missed, ammo wasted" } }],
  ["Right", { x: 11, y: 13, dir: 0, enemies: [[11, 15]] }],
  ["Shoot", { x: 1, y: 10, dir: 2, enemies: [[1, 12]] }],
  ["Forward", { x: 5, y: 11, dir: 0, enemies: [[1, 1]], unexploredAreas: [[1, 8, 3, 10]] }],
  ["Left", { x: 5, y: 5, dir: 2, enemies: [[9, 5]] }],
  ["Right", { x: 11, y: 12, dir: 3, enemies: [[1, 1]], unexploredAreas: [[3, 9, 5, 11]] }],
  ["Shoot", { x: 8, y: 11, dir: 1, enemies: [[11, 11], [10, 11]] }],
  ["Left", { x: 15, y: 1, dir: 3, enemies: [[1, 1]], unexploredAreas: [[7, 10, 9, 12]] }],
  ["Right", { x: 12, y: 7, dir: 3, enemies: [[1, 1]], unexploredAreas: [[15, 7, 15, 9]] }],
  ["Shoot", { x: 13, y: 10, dir: 0, enemies: [[13, 7]], health: 40 }],
  ["Forward", { x: 3, y: 5, dir: 1, enemies: [[13, 13]], ammo: 0 }],
];

/* Worked examples, shown to the model as earlier turns of the conversation. They sit in the
   cached prefix, so they cost nothing per decision, and the engine generates them, so they
   always match the current perception format. */
export const examples = () =>
  EXAMPLES.map(([answer, setup]) => ({ state: userPrompt(describe(perceive(scenario(setup)))), answer }));
