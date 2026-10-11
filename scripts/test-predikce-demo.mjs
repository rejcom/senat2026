// Rychlá kontrola celé cesty: okrsky-k1.json → demo dávky K2 → createPredictor → predikce proti „pravdě“ dema.
import fs from 'node:fs';
import { indexK1, createPredictor } from '../src/predikce.js';
import { createDemoK2 } from '../src/demo-k2.js';

const k1 = JSON.parse(fs.readFileSync(new URL('../public/data/okrsky-k1.json', import.meta.url), 'utf8'));
const map = indexK1(k1);
const pairs = new Map();
for (const [obvod, prec] of map) {
  const tot = {};
  for (const p of prec) for (const [c, v] of Object.entries(p.v1)) tot[c] = (tot[c] ?? 0) + v;
  const top = Object.entries(tot).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([c]) => +c);
  pairs.set(obvod, top);
}
console.log('obvodů', pairs.size, 'okrsků', [...map.values()].reduce((s, a) => s + a.length, 0));

for (const frac of [0.05, 0.2, 0.5, 1]) {
  const demo = createDemoK2(map, pairs, { minutes: 10, startedAt: Date.now() - frac * 10 * 60_000 });
  const p = createPredictor({ k1: map, fetchBatch: demo.fetchBatch });
  await p.refresh();
  let se = 0;
  let n = 0;
  let cover = 0;
  let pub = 0;
  for (const [obvod, [A, B]] of pairs) {
    const [a, b] = p.leaderOfFirstRound(obvod, A, B);
    const r = p.predict(obvod, a, b);
    if (!r || !r.publish) continue;
    const T = demo.truth(obvod);
    // demo.truth je podíl „A z dvojice pairs“ – přepočet na podíl vedoucího a
    const truthA = a === A ? T : 1 - T;
    se += ((r.share - truthA) * 100) ** 2;
    cover += truthA >= r.lo && truthA <= r.hi ? 1 : 0;
    n++;
    pub++;
  }
  console.log(`sečteno ~${Math.round(frac * 100)} % dávek: dávek ${p.batches}, okrsků ${p.precincts}, vydáno ${pub} predikcí, RMSE ${n ? Math.sqrt(se / n).toFixed(2) : '–'} p. b., pokrytí 90% intervalu ${n ? Math.round((cover / n) * 100) : '–'} %`);
}
