/* The wording rules below were each measured on the small Qwen models (see src/game/prompts.js):
   these tests keep a later edit from undoing them by accident. */

import { describe, expect, test } from "vitest";
import * as G from "../src/game/index.js";
import { EXAMPLES } from "../src/game/prompts.js";

const bestAction = (w, p) => {
  const probs = G.heuristic(p, G.blockedActions(w));
  return G.ACTIONS.reduce((a, b) => probs[b] > probs[a] ? b : a);
};

/* Many situations: every floor cell and direction, with two enemies placed around the maze. */
function* situations() {
  const free = [];
  for (let y = 0; y < G.SIZE; y++) for (let x = 0; x < G.SIZE; x++) if (!G.wallAt(x, y)) free.push([x, y]);
  let i = 0;
  for (const [x, y] of free) for (let dir = 0; dir < 4; dir++) {
    const e1 = free[(i++ * 37) % free.length], e2 = free[(i * 53) % free.length];
    const w = G.scenario({ x, y, dir, enemies: [e1, e2], explored: i % 3 !== 0 });
    yield { w, p: G.perceive(w) };
  }
}

describe("answers", () => {
  test("are the four single words the system prompt asks for", () => {
    expect(G.ANSWERS).toEqual(["Forward", "Left", "Right", "Shoot"]);
    expect(G.systemPrompt()).toContain("Answer with a single word: Forward, Left, Right or Shoot.");
  });

  test("mirror Left and Right, and only them", () => {
    expect(G.MIRRORED_ANSWER.map(i => G.ANSWERS[i])).toEqual(["Forward", "Right", "Left", "Shoot"]);
  });
});

describe("worked examples", () => {
  test("are balanced: four of each answer", () => {
    for (const answer of G.ANSWERS) expect(EXAMPLES.filter(([a]) => a === answer)).toHaveLength(4);
  });

  test("teach what the rule-based bot would do", () => {
    for (const [answer, setup] of EXAMPLES) {
      const w = G.scenario(setup);
      expect(bestAction(w, G.perceive(w)), JSON.stringify(setup)).toBe(G.ACTIONS[G.ANSWERS.indexOf(answer)]);
    }
  });
});

describe("perception text", () => {
  test("ends with the crosshair: small models weigh the last lines most", () => {
    for (const { p } of situations()) expect(G.describe(p).split("\n").at(-1)).toMatch(/^Crosshair: /);
  });

  test("names the answer word when an enemy is in the crosshair", () => {
    for (const { p } of situations())
      if (p.crosshair) expect(G.describe(p)).toMatch(/Crosshair: ENEMY, \d+ cells? away\. Shoot\.$/);
  });

  test("never echoes the last move: small models repeat it", () => {
    const w = G.scenario({ x: 5, y: 5, dir: 1, last: { action: "Turn right", result: null } });
    expect(G.describe(G.perceive(w))).not.toMatch(/Turn right|Last action/);
  });

  test("seen in a mirror, swaps the Left and Right lines and nothing else", () => {
    for (const { p } of situations()) {
      const lines = G.describe(p).split("\n"), mirrored = G.describe(G.mirror(p)).split("\n");
      const at = prefix => lines.findIndex(l => l.startsWith(prefix));
      expect(mirrored[at("Left:")].slice(5)).toBe(lines[at("Right:")].slice(6));
      expect(mirrored[at("Right:")].slice(6)).toBe(lines[at("Left:")].slice(5));
      expect(G.describe(G.mirror(G.mirror(p)))).toBe(G.describe(p));
    }
  });
});
