/* ═══════════════════════════ Rules ═══════════════════════════
   Every number that sets the game's balance and pace. `npm run simulate` shows their effect. */

export const ACTIONS = ["Move forward", "Turn left", "Turn right", "Shoot"];

/* Seconds each action takes: the view glides over this time, and in real time the monsters keep
   moving meanwhile. */
export const ACTION_TIME = { "Move forward": 0.26, "Turn left": 0.22, "Turn right": 0.22, "Shoot": 0.2 };

export const RULES = {
  health: 100, ammo: 24, ammoPickup: 8, healthPickup: 30,
  shotDamage: 50,
  sightRange: 12,       // cells
  hearingRange: 6,
  memory: 45,           // s before a seen area counts as unexplored again
  gunshotRange: 20,     // walking distance at which a gunshot wakes the monsters up
  patience: 8,          // s without contact before the nearest sleeping monster comes hunting
  pain: 0.35,           // s a monster flinches when hit (see painChance); it loses the attack it was charging
  fireballSpeed: 5,     // cells per second
  noiseMemory: 1.5,     // s during which a monster that attacked can be heard
};

/* A small Doom bestiary. Times in seconds; a step is the time to glide to the next cell, and
   monsters chain their steps, so they move continuously rather than hopping. */
export const MONSTERS = {
  // Floating eye: lines up with the robot and spits fireballs; its mouth glows while it charges.
  watcher: { name: "Watcher", health: 150, step: 0.62, range: 12, charge: 0.6, cooldown: 1.8, damage: 15, painChance: 0.5 },
  // Burning skull: fast, charges in and bites.
  seeker: { name: "Seeker", health: 50, step: 0.4, dash: 0.26, dashRange: 6, damage: 10, cooldown: 0.9, firstBite: 0.45, painChance: 1 },
};
