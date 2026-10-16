// Zkouška živého modulu src/predikce.js na SKUTEČNÝCH dávkách ČSÚ z 2. kola senátních voleb 2024.
// Stahuje reálné dávky okrskových výsledků (K2) se skutečným pořadím zpracování a v několika okamžicích porovná predikci s konečným výsledkem.
//   node scripts/test-replay-2024.mjs        (potřebuje .cache/senat-archiv/set5-2024.csv, vznikne spuštěním scripts/predikce-lab.mjs)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPredictor, indexK1 } from '../src/predikce.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const csv = new TextDecoder('windows-1250').decode(fs.readFileSync(path.join(ROOT, '.cache', 'senat-archiv', 'set5-2024.csv')));
const lines = csv.trim().split(/\r?\n/);
const h = lines[0].split(';');
const ix = (k) => h.indexOf(k);
const h1 = ix('HLASY_01');

// 1. kolo 2024 ve stejném tvaru jako public/data/okrsky-k1.json
const obvody = {};
for (const l of lines.slice(1)) {
  const r = l.split(';');
  if (r[ix('KOLO')] !== '1') continue;
  const v = [];
  for (let c = 0; c < 22; c++) if (+r[h1 + c]) v.push(`${c + 1}:${+r[h1 + c]}`);
  (obvody[+r[ix('OBVOD')]] ??= []).push([`${r[ix('OBEC')]}-${r[ix('OKRSEK')]}`, +r[ix('VOL_SEZNAM')], +r[ix('PL_HL_CELK')], v.join(',')]);
}
const k1Map = indexK1({ obvody });

// reálné dávky K2 (stáhnou se jednou)
const batches = [];
for (let n = 1; n < 500; n++) {
  const res = await fetch(`https://volby.gov.cz/appdata/senat/20240920/odata/okrsky/K2/vysledky_okrsky_${String(n).padStart(5, '0')}.xml`);
  if (!res.ok) break;
  const t = await res.text();
  if (t.includes('<CHYBA')) break;
  batches.push(t);
}
console.log(`stažených dávek K2 2024: ${batches.length}`);

// konečný stav a dvojice kandidátů
const full = createPredictor({ k1: k1Map, fetchBatch: async (n) => batches[n - 1] ?? null });
await full.refresh();
const totals = new Map(); // obvod -> {cislo: hlasy}
for (const t of batches) {
  const { parseBatch } = await import('../src/predikce.js');
  for (const r of parseBatch(t)) {
    const m = totals.get(r.obvod) ?? {};
    for (const [c, v] of Object.entries(r.votes)) m[c] = (m[c] ?? 0) + v;
    totals.set(r.obvod, m);
  }
}
const pairs = new Map([...totals].map(([o, m]) => [o, Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([c]) => +c)]));
console.log(`obvodů ve 2. kole: ${pairs.size}, okrsků v dávkách: ${full.precincts}`);

for (const frac of [0.1, 0.25, 0.5, 0.75]) {
  const upto = Math.max(1, Math.round(frac * batches.length));
  const p = createPredictor({ k1: k1Map, fetchBatch: async (n) => (n <= upto ? batches[n - 1] : null) });
  await p.refresh();
  let n = 0;
  let se = 0;
  let cover = 0;
  let sureWrong = 0;
  let sure = 0;
  for (const [obvod, [c1, c2]] of pairs) {
    const [A, B] = p.leaderOfFirstRound(obvod, c1, c2);
    const r = p.predict(obvod, A, B);
    if (!r?.publish) continue;
    const m = totals.get(obvod);
    const T = (m[A] ?? 0) / ((m[A] ?? 0) + (m[B] ?? 0));
    n++;
    se += ((r.share - T) * 100) ** 2;
    cover += T >= r.lo && T <= r.hi ? 1 : 0;
    if (r.pWin > 0.95 || r.pWin < 0.05) {
      sure++;
      if ((r.pWin > 0.5) !== (T > 0.5)) sureWrong++;
    }
  }
  console.log(`po ${upto}/${batches.length} dávkách (${Math.round(frac * 100)} %): predikce pro ${n} obvodů, RMSE ${Math.sqrt(se / n).toFixed(2)} p. b., 90% interval pokryl ${Math.round((cover / n) * 100)} %, jistých výroků ${sure}, z toho špatně ${sureWrong}`);
}

// milníky 5 / 10 / 25 % u tří obvodů (co predikce tvrdila při překonání prahu vs. skutečnost)
console.log('\nMilníky (ukázka):');
for (const [obvod, [c1, c2]] of [...pairs].slice(0, 3)) {
  const [A, B] = full.leaderOfFirstRound(obvod, c1, c2);
  const m = totals.get(obvod);
  const T = (m[A] ?? 0) / ((m[A] ?? 0) + (m[B] ?? 0));
  console.log(`obvod ${obvod}: konečný podíl ${(T * 100).toFixed(1)} %`);
  for (const x of full.milestones(obvod, A, B)) {
    console.log(`  ${Math.round(x.prah * 100)} % (okrsků ${x.counted}/${x.total}, ${x.cas ?? '?'}): predikce ${(x.share * 100).toFixed(1)} % [${(x.lo * 100).toFixed(1)}–${(x.hi * 100).toFixed(1)}], dosavadní ${(x.current * 100).toFixed(1)} %, výhra ${Math.round(x.pWin * 100)} %`);
  }
}
