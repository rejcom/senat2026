// Zmrazí PŘEDBĚŽNÝ odhad 2. kola (před hlasováním): pro každý postupující obvod šanci vedoucího z 1. kola.
// Soubor se commitne a pushne PŘED začátkem hlasování, takže commit (čas + hash) je důkaz, že se odhad zpětně neupravoval.
//
//   node scripts/predikce-freeze.mjs
//
// Výstup: doc/zaznam-predikce/pred-2-kolem.json a pred-2-kolem.md

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { indexK1, createPredictor, preVoteProb } from '../src/predikce.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'doc', 'zaznam-predikce');
fs.mkdirSync(OUT, { recursive: true });

const attr = (s, k) => (s.match(new RegExp(`${k}="([^"]*)"`)) || [])[1];
const cand = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'candidates.json'), 'utf8'));
const k1 = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'okrsky-k1.json'), 'utf8'));
const predictor = createPredictor({ k1: indexK1(k1), fetchBatch: async () => null });

const res = await fetch('https://volby.gov.cz/appdata/senat/20261009/odata/vysledky.xml', { headers: { 'User-Agent': 'Mozilla/5.0' } });
if (!res.ok) throw new Error(`ČSÚ vysledky.xml: HTTP ${res.status}`);
const xml = await res.text();
const generated = attr(xml.match(/<VYSLEDKY [^>]*>/)[0], 'DATUM_CAS_GENEROVANI');

const partyName = (c) => cand.parties[c.partyId]?.short ?? String(c.partyId);
const person = (o, no) => {
  const c = o.candidates.find((x) => x.no === no);
  return { no, jmeno: `${c.firstName} ${c.lastName}`, strana: partyName(c), obhajuje: !!c.defends };
};

const obvody = [];
for (const m of xml.matchAll(/<OBVOD ([^>]*)>([\s\S]*?)<\/OBVOD>/g)) {
  const id = +attr(m[1], 'CISLO');
  const adv = [...m[2].matchAll(/<KANDIDAT ([^>]*)\/>/g)].filter((k) => attr(k[1], 'ZVOLEN_1KOLO') === '2.KOLO').map((k) => +attr(k[1], 'PORADOVE_CISLO'));
  if (adv.length !== 2) continue;
  const o = cand.obvody.find((x) => x.id === id);
  const fr = predictor.firstRound(id, adv[0], adv[1]);
  obvody.push({
    id,
    nazev: o.name,
    vedouci: { ...person(o, fr.a), podil1Kolo: Math.round(fr.aPct * 100) / 100 },
    vyzyvatel: { ...person(o, fr.b), podil1Kolo: Math.round(fr.bPct * 100) / 100 },
    naskokPb: Math.round(fr.lead * 100) / 100,
    pravdepodobnostVyhryVedouciho: Math.round(fr.prob * 1000) / 1000,
  });
}
obvody.sort((a, b) => a.id - b.id);

let commit = 'neznámý';
try {
  commit = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim();
} catch {
  /* bez gitu */
}

const zaznam = {
  popis: 'Předběžný odhad 2. kola senátních voleb 2026 PŘED začátkem hlasování. Zmrazeno, dále se neupravuje.',
  zmrazeno: new Date().toISOString(),
  dataCsuZ: generated,
  gitCommitModelu: commit,
  vzorec: 'šance vedoucího = 1 / (1 + exp(−(−0,11 + 0,225 × náskok_v_procentních_bodech))), ořezáno na 3–97 %',
  zdrojVzorce: '97 druhých kol senátních voleb 2018–2024 (doc/PREDIKCE.md)',
  obvody,
};
fs.writeFileSync(path.join(OUT, 'pred-2-kolem.json'), JSON.stringify(zaznam, null, 2));

const cz = (x, d = 1) => x.toLocaleString('cs-CZ', { minimumFractionDigits: d, maximumFractionDigits: d });
let md = `# Předběžný odhad 2. kola (zmrazeno před hlasováním)\n\n`;
md += `Zmrazeno: ${zaznam.zmrazeno} · data ČSÚ z ${generated} · commit modelu \`${commit.slice(0, 10)}\`\n\n`;
md += `Šance vedoucího z 1. kola vychází jen z jeho náskoku: ${zaznam.vzorec}. Zdroj koeficientů: ${zaznam.zdrojVzorce}.\n\n`;
md += `| obvod | vedoucí z 1. kola | vyzyvatel | náskok | šance vedoucího |\n|---|---|---|---|---|\n`;
for (const o of obvody) {
  md += `| ${o.id} ${o.nazev} | ${o.vedouci.jmeno} (${o.vedouci.strana}) ${cz(o.vedouci.podil1Kolo)} % | ${o.vyzyvatel.jmeno} (${o.vyzyvatel.strana}) ${cz(o.vyzyvatel.podil1Kolo)} % | ${cz(o.naskokPb)} p. b. | ${Math.round(o.pravdepodobnostVyhryVedouciho * 100)} % |\n`;
}
const expected = obvody.reduce((s, o) => s + o.pravdepodobnostVyhryVedouciho, 0);
md += `\nOčekávaný počet obvodů, které vyhraje vedoucí z 1. kola: ${cz(expected)} z ${obvody.length}.\n`;
fs.writeFileSync(path.join(OUT, 'pred-2-kolem.md'), md);
console.log(`Zmrazeno ${obvody.length} obvodů (očekávaný počet výher vedoucích ${cz(expected)}) → doc/zaznam-predikce/pred-2-kolem.{json,md}`);
