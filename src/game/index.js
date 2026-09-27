/* ═══════════════════════════ Game: world, rules and perception ═══════════════════════════
   DOM-free: the page, the tests and the simulation share exactly this code. This file is its
   public interface; the modules behind it, in dependency order:
     level.js       the maze
     rules.js       balance: health, ammo, monster stats, action durations
     grid.js        geometry: directions, walls, line of sight
     world.js       world state: creation, what has been seen, end of game
     monsters.js    monster behaviour and fireballs (updateWorld)
     actions.js     the pilot's actions
     perception.js  what the sensors report
     prompts.js     the text sent to the model, system prompt and worked examples
     bot.js         the rule-based pilot */

export { MAP, SIZE } from "./level.js";
export { ACTIONS, ACTION_TIME, RULES, MONSTERS } from "./rules.js";
export { DIRS, wallAt, relative, lineOfSight, freeCells } from "./grid.js";
export { createWorld, scenario, seenRecently } from "./world.js";
export { updateWorld } from "./monsters.js";
export { blockedActions, applyAction } from "./actions.js";
export { perceive } from "./perception.js";
export { ANSWERS, MIRRORED_ANSWER, STRATEGY, describe, distance, mirror, systemPrompt, userPrompt, examples } from "./prompts.js";
export { heuristic } from "./bot.js";
