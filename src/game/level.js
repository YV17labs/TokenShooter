/* ═══════════════════════════ Level ═══════════════════════════ */

/* A maze of corridors one cell wide, like the dungeon crawlers the grid movement comes from:
   no open floor anywhere (never a 2×2 block), so moving cell by cell and shooting along the
   corridors always looks natural. The middle is a pillared hall. Legend: 1-4 walls (the trim
   colour changes), . floor, > v < ^ player start, W watcher, S seeker (see MONSTERS), a ammo,
   + health pack. */
export const MAP = [
  "11111111111111111",
  "1>..........2W..1",
  "1.33333.322.222.1",
  "1.3..a3S322+....1",
  "1.3.333.322222221",
  "1...............1",
  "1.33444.4442222.1",
  "1.3S4....S4a..2.1",
  "1.3.4.4.4.422.2.1",
  "1.............2W1",
  "1.3.4.4.4.422.2.1",
  "1.3.4.......2S2.1",
  "1.3.4444444.2.2.1",
  "1W1..+111S1.1a1.1",
  "1.1111111.1.111.1",
  "1..........W....1",
  "11111111111111111",
];
export const SIZE = MAP.length;
MAP.forEach((row, i) => {
  if (row.length !== SIZE) throw new Error(`MAP row ${i}: ${row.length} characters instead of ${SIZE}`);
});

export const STARTS = { "^": 0, ">": 1, "v": 2, "<": 3 };
export const KINDS = { W: "watcher", S: "seeker" };
