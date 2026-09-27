import { describe, expect, test } from "vitest";
import { MAP, SIZE, DIRS, wallAt, createWorld } from "../src/game/index.js";

const floor = [];
for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (!wallAt(x, y)) floor.push([x, y]);

describe("level", () => {
  test("is square and walled all round", () => {
    for (const row of MAP) expect(row).toHaveLength(SIZE);
    for (let i = 0; i < SIZE; i++)
      for (const [x, y] of [[i, 0], [i, SIZE - 1], [0, i], [SIZE - 1, i]]) expect(wallAt(x, y)).toBeTruthy();
  });

  test("has exactly one player start", () => {
    expect(MAP.join("").match(/[><v^]/g)).toHaveLength(1);
  });

  // Moving cell by cell and shooting along rows only looks natural without open floor.
  test("has no open floor: never a 2×2 block", () => {
    for (let y = 0; y < SIZE - 1; y++) for (let x = 0; x < SIZE - 1; x++)
      expect(!wallAt(x, y) && !wallAt(x + 1, y) && !wallAt(x, y + 1) && !wallAt(x + 1, y + 1), `block at ${x},${y}`).toBe(false);
  });

  test("every floor cell, monster and item can be reached from the start", () => {
    const w = createWorld();
    const reached = new Set([`${w.player.x},${w.player.y}`]), queue = [[w.player.x, w.player.y]];
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i];
      for (const [dx, dy] of DIRS) {
        const key = `${x + dx},${y + dy}`;
        if (wallAt(x + dx, y + dy) || reached.has(key)) continue;
        reached.add(key);
        queue.push([x + dx, y + dy]);
      }
    }
    expect(reached.size).toBe(floor.length);
    for (const thing of [...w.enemies, ...w.items]) expect(reached.has(`${thing.x},${thing.y}`)).toBe(true);
  });
});
