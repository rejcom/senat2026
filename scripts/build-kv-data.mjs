// Stáhne otevřená data ČSÚ pro volby do zastupitelstev obcí 2026 (jen vybraná města) a připraví JSON pro web.
// Navíc stáhne výsledky předchozích komunálních voleb 2022 (současné složení rady) a podle jména a věku
// spáruje kandidáty 2026 se zvolenými zastupiteli 2022 – ti dostanou příznak `obhajuje`.
//
//   npm run data:kv     – stáhne registr kandidátů pro města v KV_CITIES níže
//
// Výstup: public/data/kv-candidates.json
// (výsledky voleb 2026 se do JSON nepřipravují, web si je čte za běhu přímo z volby.gov.cz, viz src/kv-live.js;
//  výsledky 2022 jsou už uzavřené a neměnné, ty se naopak natáhnou jako statická data)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'data');
fs.mkdirSync(OUT, { recursive: true });

const OPENDATA_2026 = 'https://volby.gov.cz/opendata/kv2026/';
const OPENDATA_2022 = 'https://volby.gov.cz/opendata/kv2022/';

// KODZASTUP zjištěné z registru ČSÚ (kvrzcoco.csv, sloupec KODZASTUP podle NAZEVOBCE).
// Plzeň = zastupitelstvo statutárního města jako celku (47 mandátů), ne jednotlivé městské obvody.
const KV_CITIES = [
  { kodzastup: '554791', nazev: 'Plzeň' },
  { kodzastup: '555771', nazev: 'Klatovy' },
  { kodzastup: '553425', nazev: 'Domažlice' },
  { kodzastup: '556831', nazev: 'Nýrsko' },
];

async function get(url, as = 'buffer') {
  const res = await fetch(url, { headers: { 'User-Agent': 'senat2026-build' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} – ${url}`);
  return as === 'text' ? res.text() : new Uint8Array(await res.arrayBuffer());
}

// Název souboru s registrem obsahuje datum poslední aktualizace, které ČSÚ mění – zjistí se z indexové stránky,
// ať skript nezávisí na konkrétním datu v adrese (stejný princip jako u senátního scripts/build-data.mjs).
async function findZip(indexPageUrl, filenamePattern) {
  const page = await get(indexPageUrl, 'text');
  const name = [...page.matchAll(new RegExp(filenamePattern, 'g'))].map((m) => m[0]).sort().at(-1);
  if (!name) throw new Error(`Na stránce ${indexPageUrl} jsem nenašel odkaz podle vzoru ${filenamePattern}`);
  return name;
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

const findEntry = (zip, name) => {
  const key = Object.keys(zip).find((k) => k.endsWith(name));
  if (!key) throw new Error(`V archivu chybí ${name}`);
  return zip[key];
};
const num = (v) => (v === '' || v == null ? null : Number(v));

console.log('Zjišťuji aktuální soubory na', OPENDATA_2026);
const regName2026 = await findZip(`${OPENDATA_2026}kv2026_opendata.htm`, 'KV2026reg\\d+_csv\\.zip');
console.log('  registr KV2026:', regName2026);
const zip2026 = unzipSync(await get(`${OPENDATA_2026}${regName2026}`));

const candidates = parseCsv(findEntry(zip2026, 'kvrk.csv')); // kandidáti
const lists = parseCsv(findEntry(zip2026, 'kvros.csv')); // kandidátní listiny (strany) na daném zastupitelstvu

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
const rzc = parseCsv(findEntry(zip2026, 'kvrzcoco.csv'));
for (const m of mesta) {
  const row = rzc.find((r) => r.KODZASTUP === m.kodzastup);
  m.mandaty = num(row?.MANDATY);
  m.pocetObyv = num(row?.POCOBYV);
}

// ---------- výsledky předchozích voleb 2022 (současné složení, kdo obhajuje) ----------
// Archiv KV2022 je uzavřený a jeho registr už má i finální výsledky – sloupce HLASY_STR/MAND_STR v kvros.csv
// a MANDAT='A' u konkrétních zvolených kandidátů v kvrk.csv (na rozdíl od KV2026, kde jsou tato pole zatím prázdná).
console.log('Zjišťuji aktuální soubory na', OPENDATA_2022);
const regName2022 = await findZip(`${OPENDATA_2022}kv2022_opendata.htm`, 'KV2022reg\\d+_csv\\.zip');
console.log('  registr KV2022 (minulé volby):', regName2022);
const zip2022 = unzipSync(await get(`${OPENDATA_2022}${regName2022}`));
const candidates2022 = parseCsv(findEntry(zip2022, 'kvrk.csv'));
const lists2022 = parseCsv(findEntry(zip2022, 'kvros.csv'));

const normName = (s) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

for (const m of mesta) {
  // Současné složení zastupitelstva (výsledek voleb 2022) – jen listiny, které získaly aspoň jeden mandát.
  m.soucasneZastupitelstvo = lists2022
    .filter((r) => r.KODZASTUP === m.kodzastup && num(r.MAND_STR) > 0)
    .map((r) => ({ nazev: r.NAZEVCELK, mandaty: num(r.MAND_STR), hlasyProc: num(r.PROCHLSTR) }))
    .sort((a, b) => b.mandaty - a.mandaty);

  // Kdo ze zvolených 2022 kandiduje znovu 2026: spárováno podle jména a příjmení, s kontrolou věku
  // (o 4 roky později by mělo být cca +4 roky; při neshodě věku nebo dvojznačném jméně se radši nepáruje,
  // ať se nikomu mylně nepřipíše cizí mandát).
  const winners2022 = candidates2022.filter((c) => c.KODZASTUP === m.kodzastup && c.MANDAT === 'A');
  const byName2026 = new Map();
  for (const l of m.listiny) {
    for (const c of l.kandidati) {
      const key = `${normName(c.jmeno)}|${normName(c.prijmeni)}`;
      (byName2026.get(key) ?? byName2026.set(key, []).get(key)).push(c);
    }
  }
  for (const w of winners2022) {
    const key = `${normName(w.JMENO)}|${normName(w.PRIJMENI)}`;
    const candidates2026Matching = byName2026.get(key);
    if (!candidates2026Matching || candidates2026Matching.length !== 1) continue; // nekandiduje znovu, nebo dvojznačné jméno
    const cand = candidates2026Matching[0];
    const vek2022 = num(w.VEK);
    if (cand.vek != null && vek2022 != null) {
      const rozdil = cand.vek - vek2022;
      if (rozdil < 2 || rozdil > 6) continue; // věk neodpovídá cca +4 rokům, nejspíš jiná osoba stejného jména
    }
    cand.obhajuje = true;
  }
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
