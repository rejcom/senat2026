// Připraví data pro přehled „okresní a krajská města“ (komunální volby 2026):
// seznam měst, počty mandátů, kandidátní listiny (jen názvy, bez kandidátů), vítěz voleb 2022 a poloha na mapě.
//
//   npm run data:mesta     – stáhne registr KV2026 a KV2022 z volby.gov.cz a polohy měst z Wikidata
//
// Výstup: public/data/kv-mesta.json
// (výsledky voleb 2026 se do JSON nepřipravují, web si je čte za běhu z volby.gov.cz, viz src/kv-live.js)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'data');
fs.mkdirSync(OUT, { recursive: true });

const OPENDATA_2026 = 'https://volby.gov.cz/opendata/kv2026/';
const OPENDATA_2022 = 'https://volby.gov.cz/opendata/kv2022/';

// Krajská města (13 + hlavní město Praha) a sídla okresů podle názvu zastupitelstva v registru ČSÚ.
const KRAJSKA = [
  'Praha', 'České Budějovice', 'Plzeň', 'Karlovy Vary', 'Ústí nad Labem', 'Liberec', 'Hradec Králové',
  'Pardubice', 'Jihlava', 'Brno', 'Olomouc', 'Zlín', 'Ostrava',
];
const OKRESNI = [
  'Benešov', 'Beroun', 'Blansko', 'Břeclav', 'Bruntál', 'Česká Lípa', 'Český Krumlov', 'Cheb', 'Chomutov',
  'Chrudim', 'Děčín', 'Domažlice', 'Frýdek-Místek', 'Havlíčkův Brod', 'Hodonín', 'Jablonec nad Nisou', 'Jeseník',
  'Jičín', 'Jindřichův Hradec', 'Karviná', 'Kladno', 'Klatovy', 'Kolín', 'Kroměříž', 'Kutná Hora', 'Litoměřice',
  'Louny', 'Mělník', 'Mladá Boleslav', 'Most', 'Náchod', 'Nový Jičín', 'Nymburk', 'Opava', 'Pelhřimov', 'Písek',
  'Prachatice', 'Prostějov', 'Přerov', 'Příbram', 'Rakovník', 'Rokycany', 'Rychnov nad Kněžnou', 'Semily',
  'Sokolov', 'Strakonice', 'Svitavy', 'Šumperk', 'Tábor', 'Tachov', 'Teplice', 'Třebíč', 'Trutnov',
  'Uherské Hradiště', 'Ústí nad Orlicí', 'Vsetín', 'Vyškov', 'Znojmo', 'Žďár nad Sázavou',
  'Brandýs nad Labem-Stará Boleslav',
];
// Na přání: další sledovaná města mimo okresní sídla (Plzeňský kraj)
const SLEDOVANA = ['Nýrsko'];

async function get(url, as = 'buffer') {
  const res = await fetch(url, { headers: { 'User-Agent': 'senat2026-build/1.0 (https://github.com/rejcom/senat2026)' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} – ${url}`);
  return as === 'text' ? res.text() : new Uint8Array(await res.arrayBuffer());
}
async function findZip(indexPageUrl, pattern) {
  const page = await get(indexPageUrl, 'text');
  const name = [...page.matchAll(new RegExp(pattern, 'g'))].map((m) => m[0]).sort().at(-1);
  if (!name) throw new Error(`Na stránce ${indexPageUrl} chybí odkaz podle vzoru ${pattern}`);
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
const entry = (zip, name) => {
  const key = Object.keys(zip).find((k) => k.endsWith(name));
  if (!key) throw new Error(`V archivu chybí ${name}`);
  return zip[key];
};
const num = (v) => (v === '' || v == null ? null : Number(v));

console.log('Stahuji registry KV2026 a KV2022…');
const reg26 = await findZip(`${OPENDATA_2026}kv2026_opendata.htm`, 'KV2026reg\\d+_csv\\.zip');
const reg22 = await findZip(`${OPENDATA_2022}kv2022_opendata.htm`, 'KV2022reg\\d+_csv\\.zip');
const z26 = unzipSync(await get(`${OPENDATA_2026}${reg26}`));
const z22 = unzipSync(await get(`${OPENDATA_2022}${reg22}`));

const rzc = parseCsv(entry(z26, 'kvrzcoco.csv'));
const lists26 = parseCsv(entry(z26, 'kvros.csv'));
const lists22 = parseCsv(entry(z22, 'kvros.csv'));

// zastupitelstva obcí (TYPZASTUP=1), jedna řádka na zastupitelstvo (u Plzně/Brna/… jich je v registru víc, podle městských obvodů)
const councils = new Map();
for (const r of rzc) {
  if (r.TYPZASTUP !== '1' || councils.has(r.KODZASTUP)) continue;
  councils.set(r.KODZASTUP, r);
}
const byName = new Map();
for (const r of councils.values()) {
  const k = r.NAZEVZAST;
  if (!byName.has(k)) byName.set(k, []);
  byName.get(k).push(r);
}

const wanted = [
  ...KRAJSKA.map((n) => ({ n, typ: 'kraj' })),
  ...OKRESNI.filter((n) => !KRAJSKA.includes(n)).map((n) => ({ n, typ: 'okres' })),
  ...SLEDOVANA.map((n) => ({ n, typ: 'sledovane' })),
];

const notFound = [];
const picked = [];
for (const { n, typ } of wanted) {
  const cand = byName.get(n) ?? byName.get(`Statutární město ${n}`) ?? byName.get(`Hlavní město ${n}`);
  if (!cand) {
    notFound.push(n);
    continue;
  }
  // stejný název má v ČR víc obcí (Hodonín, Písek…); okresní/krajské město je vždy ta nejlidnatější
  const best = [...cand].sort((a, b) => (num(b.POCOBYV) ?? 0) - (num(a.POCOBYV) ?? 0))[0];
  if (cand.length > 1) console.warn(`  „${n}“: ${cand.length} obcí stejného jména, beru nejlidnatější (KODZASTUP ${best.KODZASTUP}, ${best.POCOBYV} obyv.)`);
  picked.push({ typ, row: best });
}
// Praha se v registru jmenuje jinak – dohledá se podle počtu mandátů a názvu
if (notFound.includes('Praha')) {
  const p = [...councils.values()].find((r) => /praha/i.test(r.NAZEVZAST) && Number(r.MANDATY) >= 55);
  if (p) {
    picked.push({ typ: 'kraj', row: p });
    notFound.splice(notFound.indexOf('Praha'), 1);
  }
}
if (notFound.length) console.warn('Nenalezeno v registru:', notFound.join(', '));

// polohy z Wikidata podle kódu obce (P782 = „CZ“ + kód obce ČSÚ)
const codes = picked.map((p) => `"CZ${p.row.KODZASTUP}"`).join(' ');
const sparql = `SELECT ?lau ?lat ?lon WHERE { VALUES ?lau { ${codes} } ?c wdt:P782 ?lau . ?c wdt:P625 ?coord . BIND(geof:latitude(?coord) AS ?lat) BIND(geof:longitude(?coord) AS ?lon) }`;
const wd = JSON.parse(await get(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`, 'text'));
const coords = new Map();
for (const b of wd.results.bindings) {
  const k = b.lau.value.replace('CZ', '');
  if (!coords.has(k)) coords.set(k, [Number(b.lon.value), Number(b.lat.value)]);
}

const mesta = picked
  .map(({ typ, row }) => {
    const k = row.KODZASTUP;
    const listiny = lists26
      .filter((r) => r.KODZASTUP === k)
      .sort((a, b) => num(a.POR_STR_HL) - num(b.POR_STR_HL))
      .map((r) => ({ ostrana: r.OSTRANA, nazev: r.NAZEVCELK, zkratka: r.ZKRATKAO8 || r.ZKRATKAO30 || r.NAZEVCELK }));
    // vítěz voleb 2022 = listina s nejvíc hlasy (PROCHLSTR = podíl hlasů v %)
    const l22 = lists22.filter((r) => r.KODZASTUP === k && num(r.HLASY_STR) != null);
    const top22 = [...l22].sort((a, b) => num(b.HLASY_STR) - num(a.HLASY_STR))[0];
    const lonLat = coords.get(k) ?? null;
    return {
      kodzastup: k,
      nazev: row.NAZEVZAST,
      typ,
      mandaty: num(row.MANDATY),
      pocetObyv: num(row.POCOBYV),
      lonLat,
      listiny,
      vitez2022: top22 ? { nazev: top22.NAZEVCELK, proc: num(top22.PROCHLSTR), mandaty: num(top22.MAND_STR) } : null,
    };
  })
  .sort((a, b) => (b.pocetObyv ?? 0) - (a.pocetObyv ?? 0));

const noCoord = mesta.filter((m) => !m.lonLat).map((m) => m.nazev);
if (noCoord.length) console.warn('Bez polohy (nezobrazí se na mapě, jen v tabulce):', noCoord.join(', '));

fs.writeFileSync(
  path.join(OUT, 'kv-mesta.json'),
  JSON.stringify({
    election: '20261009',
    aktualizovano: new Date().toISOString(),
    resultsBase: 'https://volby.gov.cz/appdata/kv2026/20261009/odata/zastup/',
    mesta,
  }),
);
console.log(`Hotovo: ${mesta.length} měst (${mesta.filter((m) => m.typ === 'kraj').length} krajských) → public/data/kv-mesta.json`);
