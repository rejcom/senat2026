// Uloží milníky predikce 2. kola (5 / 10 / 25 / 50 / 75 % sečtených okrsků: co jsme tvrdili a jaká byla tehdy skutečnost)
// natrvalo do public/data/predikce-milniky-2kolo.json. Web ho po sečtení používá místo přehrávání dávek z ČSÚ, takže záznam
// zůstane na webu, i kdyby ČSÚ dávky přestal nabízet.
//
//   node scripts/predikce-milniky.mjs            dávky vezme z .cache/k2-2026 (záznam), jinak je stáhne od ČSÚ
//   node scripts/predikce-milniky.mjs --dir X    jiná složka s dávkami
//   node scripts/predikce-milniky.mjs --out F    jiný výstupní soubor (zkouška)
//
// Po vygenerování: git add public/data/predikce-milniky-2kolo.json && commit && push.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createPredictor, parseBatch } from '../src/predikce.js';
import { args, loadK1, readSavedBatches, fetchRemote, pairsFromRows, ROOT } from './k2-common.mjs';

const opt = args();
const k1 = loadK1();

let batches = fs.existsSync(opt.dir) ? readSavedBatches(opt.dir) : [];
if (!batches.length) {
  console.log('Uložené dávky nemám, stahuji od ČSÚ…');
  for (let n = 1; ; n++) {
    const t = await fetchRemote(opt.base, n);
    if (!t) break;
    batches.push(t);
  }
}
if (!batches.length) throw new Error('Žádné dávky 2. kola (ČSÚ je zatím nezveřejnil).');
console.log(`Dávek: ${batches.length}`);

const p = createPredictor({ k1, fetchBatch: async (n) => batches[n - 1] ?? null });
await p.refresh();
const pairs = pairsFromRows(batches.flatMap(parseBatch));

const obvody = {};
let finished = 0;
for (const [obvod, [c1, c2]] of [...pairs].sort((a, b) => a[0] - b[0])) {
  const [A, B] = p.leaderOfFirstRound(obvod, c1, c2);
  const ms = p.milestones(obvod, A, B);
  const end = p.predict(obvod, A, B);
  const done = !!end && end.countedPct >= 0.999;
  if (done) finished++;
  obvody[obvod] = {
    A,
    B,
    milniky: ms.map((x) => ({ ...x, share: +x.share.toFixed(5), lo: +x.lo.toFixed(5), hi: +x.hi.toFixed(5), pWin: +x.pWin.toFixed(4), current: +x.current.toFixed(5), countedPct: +x.countedPct.toFixed(4) })),
    konec: done ? { share: +end.currentShare.toFixed(5), counted: end.counted, total: end.total } : null,
  };
}

let commit = null;
try {
  commit = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim();
} catch {
  /* bez gitu */
}
const out = {
  popis: 'Milníky predikce 2. kola: při překonání prahu sečtených okrsků obvodu, co model odhadoval a jaká byla tehdy skutečnost. Stejný kód jako web (src/predikce.js), dávky ČSÚ v původním pořadí.',
  vygenerovano: new Date().toISOString(),
  gitCommitModelu: commit,
  davek: batches.length,
  hotovychObvodu: finished,
  obvodu: Object.keys(obvody).length,
  obvody,
};
const outArg = process.argv.indexOf('--out');
const file = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : path.join(ROOT, 'public', 'data', 'predikce-milniky-2kolo.json');
fs.writeFileSync(file, JSON.stringify(out));
console.log(`Uloženo ${path.relative(ROOT, file)}: ${out.obvodu} obvodů, z toho ${finished} sečtených úplně.`);
if (finished < out.obvodu) console.log('Pozor: některé obvody ještě nejsou sečtené. Soubor se hodí až po úplném sečtení; web u nedokončených obvodů dál přehrává dávky živě.');
