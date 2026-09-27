/* Balance report: the rule-based bot plays many games at each pace, in a second or two.
   Usage: npm run simulate [-- games]   (200 per pace by default) */

import { play } from "../src/game/simulate.js";

const N = Number(process.argv[2]) || 200;

function summary(label, rs) {
  const won = rs.filter(r => r.state === "won"), n = rs.length;
  const avg = (xs, f) => xs.length ? (xs.reduce((a, r) => a + f(r), 0) / xs.length) : NaN;
  console.log(`${label.padEnd(26)} win ${(won.length / n * 100).toFixed(0).padStart(3)}%  lost ${rs.filter(r => r.state === "lost").length}  timeout ${rs.filter(r => r.state === "playing").length}` +
    `  time ${avg(rs, r => r.time).toFixed(0)}s  dmg ${avg(rs, r => r.damageTaken).toFixed(0)}  hpLeft(won) ${avg(won, r => r.health).toFixed(0)}` +
    `  kills ${avg(rs, r => r.kills).toFixed(1)}  shots ${avg(rs, r => r.shots).toFixed(1)} acc ${(avg(rs, r => r.hits / Math.max(1, r.shots)) * 100).toFixed(0)}%` +
    `  fireballs ${avg(rs, r => r.ev.fireball).toFixed(1)} (hit ${avg(rs, r => r.ev.impactHit).toFixed(1)}) bites ${avg(rs, r => r.ev.bite).toFixed(1)} firstHurt ${avg(rs.filter(r => r.firstContact), r => r.firstContact).toFixed(0)}s`);
}

const seeds = Array.from({ length: N }, (_, i) => i + 1);
summary("bot turn-based", seeds.map(s => play(s)));
summary("bot live 150ms", seeds.map(s => play(s, { live: true, latency: 0.15 })));
summary("bot live 270ms", seeds.map(s => play(s, { live: true, latency: 0.27 })));
