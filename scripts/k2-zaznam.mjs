// Záznam 2. kola za provozu: každou novou dávku okrskových výsledků ČSÚ uloží na disk i s časem stažení a zapíše,
// co v tu chvíli ukazovala predikce v každém obvodu (stejný kód jako web, src/predikce.js). Z toho pak
// scripts/k2-vyhodnoceni.mjs spočítá, jak přesná predikce byla při 5, 10, 25, 50 % sečtených okrsků a na konci.
//
//   node scripts/k2-zaznam.mjs                 spustit v sobotu před 14:00 a nechat běžet (skončí sám po sečtení)
//   node scripts/k2-zaznam.mjs --once          jen dotáhnout, co už je venku, a skončit
//   node scripts/k2-zaznam.mjs --demo 2 --dir .cache/k2-demo    zkouška na vymyšlených dávkách (sečte se za 2 minuty)
//
// Ukládá do .cache/k2-2026/: vysledky_okrsky_NNNNN.xml, casy.json (čas stažení dávky), predikce.jsonl (jeden řádek = obvod v jednom okamžiku).

import fs from 'node:fs';
import { createPredictor, parseBatch, verdict } from '../src/predikce.js';
import { args, loadK1, loadCandidates, batchFile, timesFile, readTimes, readSavedBatches, fetchRemote, pairsFromRows } from './k2-common.mjs';

const opt = args();
fs.mkdirSync(opt.dir, { recursive: true });
const k1 = loadK1();
const cands = loadCandidates();
const times = readTimes(opt.dir);
const batches = readSavedBatches(opt.dir);
const POLL_MS = opt.demo ? 2_000 : 20_000;
const IDLE_END_MS = opt.demo ? 15_000 : 30 * 60_000;

let source = (n) => fetchRemote(opt.base, n);
if (opt.demo) {
  const { createDemoK2 } = await import('../src/demo-k2.js');
  // demo: obvody, kde vedoucí z 1. kola neměl nadpoloviční většinu, dvojice = dva nejlepší z 1. kola
  const pairs = new Map();
  for (const [o, prec] of k1) {
    const tot = {};
    let n = 0;
    for (const p of prec) {
      n += p.N1;
      for (const [c, v] of Object.entries(p.v1)) tot[c] = (tot[c] ?? 0) + v;
    }
    const top = Object.entries(tot).sort((a, b) => b[1] - a[1]);
    if (top[0][1] / n <= 0.5) pairs.set(o, [+top[0][0], +top[1][0]]);
  }
  source = createDemoK2(k1, pairs, { minutes: opt.demo, seed: 11, chunk: 60 }).fetchBatch;
}

const log = fs.createWriteStream(`${opt.dir}/predikce.jsonl`, { flags: 'a' });
const pct = (x) => `${(x * 100).toFixed(1)} %`.padStart(7);

function snapshot() {
  const p = createPredictor({ k1, fetchBatch: async (n) => batches[n - 1] ?? null });
  return p.refresh().then(() => {
    const rows = batches.flatMap(parseBatch);
    const pairs = pairsFromRows(rows);
    const at = new Date().toISOString();
    const lines = [];
    for (const [obvod, [c1, c2]] of [...pairs].sort((a, b) => a[0] - b[0])) {
      const [A, B] = p.leaderOfFirstRound(obvod, c1, c2);
      const r = p.predict(obvod, A, B);
      if (!r) continue;
      const rec = { at, batch: batches.length, obvod, A, B, counted: r.counted, total: r.total, countedPct: r.countedPct, publish: r.publish, share: r.share, lo: r.lo, hi: r.hi, pWin: r.pWin, currentShare: r.currentShare };
      log.write(JSON.stringify(rec) + '\n');
      const c = cands.get(obvod);
      const v = verdict(r, c?.cand.get(A)?.name ?? A, c?.cand.get(B)?.name ?? B);
      lines.push(`${String(obvod).padStart(2)} ${(c?.name ?? '').padEnd(22)} sečteno ${pct(r.countedPct)}  ${(c?.cand.get(A)?.name ?? A).padEnd(22)} ${r.publish ? `${pct(r.share)} (${pct(r.lo)}–${pct(r.hi)}) výhra ${pct(r.pWin)}  ${v?.level ?? ''}` : 'zatím málo okrsků'}`);
    }
    console.log(`\n${new Date().toLocaleTimeString('cs-CZ')}  dávek ${batches.length}, okrsků ${p.precincts}\n${lines.join('\n')}`);
    return pairs.size && [...pairs.keys()].every((o) => {
      const r = p.predict(o, ...pairs.get(o));
      return r && r.countedPct >= 1;
    });
  });
}

let lastNew = Date.now();
let pending = batches.length > 0;
console.log(`Záznam 2. kola → ${opt.dir}${opt.demo ? ' (DEMO, vymyšlená data)' : ''}. Už uloženo dávek: ${batches.length}.`);
for (;;) {
  let got = 0;
  for (;;) {
    const n = batches.length + 1;
    let t = null;
    try {
      t = await source(n);
    } catch (e) {
      console.error(`chyba stahování dávky ${n}: ${e.message}`);
    }
    if (!t) break;
    fs.writeFileSync(batchFile(opt.dir, n), t);
    times[n] = new Date().toISOString();
    fs.writeFileSync(timesFile(opt.dir), JSON.stringify(times, null, 1));
    batches.push(t);
    got++;
  }
  if (got) {
    lastNew = Date.now();
    pending = true;
  }
  let done = false;
  if (pending) {
    done = await snapshot();
    pending = false;
  }
  if (opt.has('--once')) break;
  if (done && Date.now() - lastNew > IDLE_END_MS) {
    console.log('\nVšechny obvody sečtené a dlouho žádná nová dávka: konec záznamu. Teď spusťte: node scripts/k2-vyhodnoceni.mjs');
    break;
  }
  if (!batches.length && !opt.demo) process.stdout.write(`\r${new Date().toLocaleTimeString('cs-CZ')} čekám na první dávku ČSÚ…`);
  await new Promise((r) => setTimeout(r, POLL_MS));
}
log.end();
