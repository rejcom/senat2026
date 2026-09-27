// Stáhne otevřená data ČSÚ pro volby do zastupitelstev obcí 2026 (jen vybraná města) a připraví JSON pro web.
//
//   npm run data:kv     – stáhne registr kandidátů pro města v KV_CITIES níže
//
// Výstup: public/data/kv-candidates.json
// (výsledky voleb se do JSON nepřipravují, web si je čte za běhu přímo z volby.gov.cz, viz src/kv-live.js)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'data');
fs.mkdirSync(OUT, { recursive: true });

const REG_ZIP_URL = 'https://volby.gov.cz/opendata/kv2026/KV2026reg20260923_csv.zip';

// KODZASTUP zjištěné z registru ČSÚ (kvrzcoco.csv, sloupec KODZASTUP podle NAZEVOBCE).
// Plzeň = zastupitelstvo statutárního města jako celku (47 mandátů), ne jednotlivé městské obvody.
const KV_CITIES = [
  { kodzastup: '554791', nazev: 'Plzeň' },
  { kodzastup: '555771', nazev: 'Klatovy' },
  { kodzastup: '553425', nazev: 'Domažlice' },
  { kodzastup: '556831', nazev: 'Nýrsko' },
];

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'senat2026-build' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} – ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

const cp1250 = new TextDecoder('windows-1250');

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ';' && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCsv(bytes) {
  const [head, ...lines] = cp1250.decode(bytes).replace(/^﻿/, '').trim().split(/\r?\n/);
  const cols = splitCsvLine(head);
  return lines.filter(Boolean).map((l) => {
    const v = splitCsvLine(l);
    return Object.fromEntries(cols.map((c, i) => [c, v[i]]));
  });
}

console.log('Stahuji registr kandidátů pro komunální volby (KV2026)…');
const zip = unzipSync(await get(REG_ZIP_URL));
const findEntry = (name) => {
  const key = Object.keys(zip).find((k) => k.endsWith(name));
  if (!key) throw new Error(`V archivu chybí ${name}`);
  return zip[key];
};

const candidates = parseCsv(findEntry('kvrk.csv')); // kandidáti
const lists = parseCsv(findEntry('kvros.csv')); // kandidátní listiny (strany) na daném zastupitelstvu

const num = (v) => (v === '' || v == null ? null : Number(v));

const mesta = KV_CITIES.map(({ kodzastup, nazev }) => {
  const cityLists = lists
    .filter((r) => r.KODZASTUP === kodzastup)
    .sort((a, b) => num(a.POR_STR_HL) - num(b.POR_STR_HL))
    .map((r) => {
      const kandidati = candidates
        .filter((c) => c.KODZASTUP === kodzastup && c.OSTRANA === r.OSTRANA)
        .sort((a, b) => num(a.PORCISLO) - num(b.PORCISLO))
        .map((c) => ({
          poradi: num(c.PORCISLO),
          jmeno: c.JMENO,
          prijmeni: c.PRIJMENI,
          titulPred: c.TITULPRED || undefined,
          titulZa: c.TITULZA || undefined,
          vek: num(c.VEK),
          povolani: c.POVOLANI || undefined,
          bydliste: c.BYDLISTEN || undefined,
        }));
      return {
        ostrana: r.OSTRANA,
        poradi: num(r.POR_STR_HL),
        nazev: r.NAZEVCELK,
        zkratka: r.ZKRATKAO8 || r.ZKRATKAO30 || r.NAZEVCELK,
        pocetKandidatu: num(r.POCSTR_SLO),
        kandidati,
      };
    });
  return { kodzastup, nazev, listiny: cityLists };
});

// Počet mandátů a obyvatel bereme z registru obcí (kvrzcoco.csv, ve stejném archivu).
const rzc = parseCsv(findEntry('kvrzcoco.csv'));
for (const m of mesta) {
  const row = rzc.find((r) => r.KODZASTUP === m.kodzastup);
  m.mandaty = num(row?.MANDATY);
  m.pocetObyv = num(row?.POCOBYV);
}

const out = {
  election: '20261009',
  aktualizovano: new Date().toISOString(),
  resultsBase: 'https://volby.gov.cz/appdata/kv2026/20261009/odata/zastup/',
  mesta,
};

fs.writeFileSync(path.join(OUT, 'kv-candidates.json'), JSON.stringify(out));
const totalCands = mesta.reduce((s, m) => s + m.listiny.reduce((s2, l) => s2 + l.kandidati.length, 0), 0);
console.log(`Hotovo: ${mesta.length} měst, ${totalCands} kandidátů → public/data/kv-candidates.json`);
