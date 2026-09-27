/* Whole games played by the rule-based bot, which follows the strategy given to the model. If a
   balance change makes these fail on purpose, run `npm run simulate` and adjust the thresholds. */

import { describe, expect, test } from "vitest";
import { play } from "../src/game/simulate.js";

const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1);

describe("balance", () => {
  test("a game replays identically from its seed", () => {
    expect(play(42, { live: true, latency: 0.2 })).toEqual(play(42, { live: true, latency: 0.2 }));
  });

  test.each([
    ["turn-based", {}],
    ["real time, 150 ms per decision", { live: true, latency: 0.15 }],
    ["real time, 270 ms per decision", { live: true, latency: 0.27 }],
  ])("the bot wins at least 95%% of games, %s", (_, options) => {
    const games = SEEDS.map(seed => play(seed, options));
    expect(games.filter(g => g.state === "won").length).toBeGreaterThanOrEqual(SEEDS.length * 0.95);
    for (const g of games) expect(g.time, "a game never drags on").toBeLessThan(90);
  });
});
