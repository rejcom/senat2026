// Stáhne otevřená data ČSÚ pro volby do Senátu 2026 a připraví z nich statické JSONy pro web.
//
//   npm run data                 – stáhne registr kandidátů, číselníky a hranice obvodů
//   npm run data:refresh         – navíc znovu stáhne aktuální složení Senátu (obhájci mandátů)
//
// Výstup: public/data/candidates.json, public/data/obvody.geojson
// (výsledky voleb se do JSON nepřipravují, web si je čte za běhu přímo z volby.gov.cz)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'data');
const SRC = path.join(ROOT, 'data-src');
const REFRESH = process.argv.includes('--refresh-incumbents');

const ELECTION = '20261009';
const OPENDATA_PAGE = 'https://volby.gov.cz/opendata/se2026/se2026_opendata.htm';
const OPENDATA_BASE = 'https://volby.gov.cz/opendata/se2026/';
const CELK_URL = 'https://volby.gov.cz/appdata/senat/aktual/odata/vysledky_celk.xml';
const GEO_URL =
  'https://geodata.csu.gov.cz/server/rest/services/Hosted/Sen%C3%A1tn%C3%AD_volebn%C3%AD_obvody_2026/FeatureServer/0/query' +
  '?where=1%3D1&outFields=obvod,nazev_vo,sidlo,pobyosl21,poc_adr,rok_voleb&outSR=4326&f=geojson&geometryPrecision=4&maxAllowableOffset=0.001';

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SRC, { recursive: true });

// ---------- pomocné funkce ----------

async function get(url, as = 'text') {
  const res = await fetch(url, { headers: { 'User-Agent': 'senat2026-build' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} – ${url}`);
  return as === 'buffer' ? new Uint8Array(await res.arrayBuffer()) : res.text();
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
  return lines.map((l) => {
    const v = splitCsvLine(l);
    return Object.fromEntries(cols.map((c, i) => [c, v[i]]));
  });
}

const xmlUnescape = (s) =>
  s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function attrs(tag) {
  const o = {};
  for (const m of tag.matchAll(/([A-Z_0-9]+)="([^"]*)"/g)) o[m[1]] = xmlUnescape(m[2]);
  return o;
}

const norm = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

// ---------- odhad pohlaví (v datech ČSÚ pohlaví není) ----------

const FEMALE_FIRST_EXTRA = new Set(['miriam', 'mariam', 'ester', 'ruth', 'ingrid', 'karin', 'beatrix', 'dagmar', 'alice', 'denisa']);
const MALE_FIRST_ENDING_A = new Set(['nikola', 'sasa', 'jirka', 'kuba', 'honza', 'olda', 'ilja']);
const overridesPath = path.join(ROOT, 'scripts', 'gender-overrides.json');
const GENDER_OVERRIDES = fs.existsSync(overridesPath) ? JSON.parse(fs.readFileSync(overridesPath, 'utf8')) : {};

function inferGender(first, last) {
  const key = `${first} ${last}`;
  if (GENDER_OVERRIDES[key]) return { g: GENDER_OVERRIDES[key], how: 'override' };
  const f = norm(first.split(' ')[0]);
  // příjmení na -ová / -á (Nováková, Černá, Lehká) je jednoznačně ženské
  if (/ová$/.test(last) || /á$/.test(last)) return { g: 'F', how: 'příjmení' };
  if (FEMALE_FIRST_EXTRA.has(f)) return { g: 'F', how: 'jméno' };
  if (/(a|ie)$/.test(f) && !MALE_FIRST_ENDING_A.has(f)) return { g: 'F', how: 'jméno' };
  return { g: 'M', how: 'výchozí' };
}

// ---------- 1) registr kandidátů a číselníky ----------

console.log('Zjišťuji aktuální soubory na', OPENDATA_PAGE);
const page = await get(OPENDATA_PAGE);
const regName = [...page.matchAll(/SE2026reg\d+_csv\.zip/g)].map((m) => m[0]).sort().at(-1);
const cisName = [...page.matchAll(/SE2026ciselniky\d+_csv\.zip/g)].map((m) => m[0]).sort().at(-1);
if (!regName || !cisName) throw new Error('Na stránce ČSÚ jsem nenašel odkazy na registr / číselníky.');
console.log('  registr:', regName, '| číselníky:', cisName);

const reg = unzipSync(await get(OPENDATA_BASE + regName, 'buffer'));
const cis = unzipSync(await get(OPENDATA_BASE + cisName, 'buffer'));

const candidatesRaw = parseCsv(reg['csv/serk.csv']);
const obvodyCis = parseCsv(cis['csv/secobv.csv']);
const partyNames = Object.fromEntries(parseCsv(cis['csv/cns.csv']).map((r) => [r.NSTRANA, r]));
const memberNames = Object.fromEntries(parseCsv(cis['csv/cpp.csv']).map((r) => [r.PSTRANA, r]));

// ---------- 2) hranice obvodů ----------

// d3-geo počítá s polygony na kouli: vnější kruh musí být po směru hodinových ručiček, díry proti.
// ArcGIS / GeoJSON RFC 7946 to mají obráceně, takže by d3 vyplnil „všechno kromě obvodu“.
function ringArea(ring) {
  let a = 0;
  for (let i = 0, n = ring.length - 1; i < n; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return a / 2; // > 0 = proti směru hodinových ručiček
}
function rewindD3(geometry) {
  const fix = (poly) =>
    poly.map((ring, i) => {
      const ccw = ringArea(ring) > 0;
      const wantCw = i === 0; // vnější kruh po směru, díry proti směru
      return ccw === wantCw ? [...ring].reverse() : ring;
    });
  if (geometry.type === 'Polygon') geometry.coordinates = fix(geometry.coordinates);
  else if (geometry.type === 'MultiPolygon') geometry.coordinates = geometry.coordinates.map(fix);
  return geometry;
}

console.log('Stahuji hranice obvodů z geodata.csu.gov.cz');
const geo = JSON.parse(await get(GEO_URL));
const geoById = new Map();
for (const f of geo.features) {
  const id = Number(f.properties.obvod);
  if (!id) continue; // 00 = vojenské újezdy
  rewindD3(f.geometry);
  geoById.set(id, f);
}

// ---------- 3) úřadující senátoři (obhájci mandátu) ----------

const incPath = path.join(SRC, 'incumbents.json');
let senators;
if (!REFRESH && fs.existsSync(incPath)) {
  senators = JSON.parse(fs.readFileSync(incPath, 'utf8'));
  console.log('Obhájci mandátů: použit uložený snímek', path.relative(ROOT, incPath), `(${senators.generated})`);
} else {
  console.log('Stahuji aktuální složení Senátu');
  const xml = await get(CELK_URL);
  const generated = xml.match(/DATUM_CAS_GENEROVANI="([^"]+)"/)?.[1];
  const list = [];
  for (const m of xml.matchAll(/<OBVOD ([^>]*)>([\s\S]*?)<\/OBVOD>/g)) {
    const o = attrs(m[1]);
    for (const s of m[2].matchAll(/<SENATOR ([^>]*)\/>/g)) {
      const a = attrs(s[1]);
      list.push({
        obvod: Number(o.CISLO),
        obvodName: o.NAZEV,
        firstName: a.JMENO,
        lastName: a.PRIJMENI,
        titlesBefore: a.TITULPRED,
        titlesAfter: a.TITULZA,
        electedYear: Number(a.ROK_ZVOLENI),
        partyId: a.NSTRANA,
        occupation: a.POVOLANI,
        residence: a.BYDLISTE,
      });
    }
  }
  senators = { generated, senators: list };
  fs.writeFileSync(incPath, JSON.stringify(senators, null, 1));
  console.log(`  ${list.length} senátorů, stav k ${generated}`);
}

// Párování senátora na kandidáta: stejné první jméno a příjmení shodné, nebo jedno obsahuje druhé
// (kandidátka „Sucharda Šípová“ vs. senátorka „Šípová“).
const firstOf = (s) => norm(s).split(' ')[0];
function findSenator(first, last) {
  const f = firstOf(first);
  const l = norm(last);
  return senators.senators.find((s) => {
    if (firstOf(s.firstName) !== f) return false;
    const sl = norm(s.lastName);
    return sl === l || l.endsWith(' ' + sl) || sl.endsWith(' ' + l);
  });
}
const senatorByObvod = new Map(senators.senators.map((s) => [s.obvod, s]));

// ---------- 4) skládání výstupu ----------

const activeIds = obvodyCis.filter((o) => o.PRVNI_VO === '6').map((o) => Number(o.OBVOD)).sort((a, b) => a - b);

const parties = {};
const genderReview = [];
const candidates = candidatesRaw.map((r) => {
  const obvod = Number(r.OBVOD);
  const { g, how } = inferGender(r.JMENO, r.PRIJMENI);
  genderReview.push(`${g} (${how.padEnd(8)}) ${r.JMENO} ${r.PRIJMENI}`);
  const partyId = r.NSTRANA;
  parties[partyId] ??= {
    id: partyId,
    short: partyNames[partyId]?.ZKRATKAN8 || partyNames[partyId]?.NAZEV_STRN || partyId,
    name: partyNames[partyId]?.NAZEV_STRN || partyId,
  };
  const sen = findSenator(r.JMENO, r.PRIJMENI);
  return {
    obvod,
    no: Number(r.CKAND),
    firstName: r.JMENO,
    lastName: r.PRIJMENI,
    titlesBefore: r.TITULPRED,
    titlesAfter: r.TITULZA,
    age: Number(r.VEK),
    gender: g,
    occupation: r.POVOLANI,
    residence: r.BYDLISTEN,
    partyId, // nominující strana – podle ní se barví
    member: r.PSTRANA === '99' ? null : (memberNames[r.PSTRANA]?.ZKRATKAP8 ?? null), // členství, null = bezpartijní
    listName: r.NAZEV_VS, // celý název kandidátní listiny / koalice
    defends: !!sen && sen.obvod === obvod, // obhajuje vlastní mandát
    senatorOf: sen && sen.obvod !== obvod ? { obvod: sen.obvod, name: sen.obvodName } : null,
  };
});

const obvody = activeIds.map((id) => {
  const info = obvodyCis.find((o) => Number(o.OBVOD) === id);
  const gf = geoById.get(id);
  const cands = candidates.filter((c) => c.obvod === id).sort((a, b) => a.no - b.no);
  const sen = senatorByObvod.get(id);
  return {
    id,
    name: info.NAZEV_OBV,
    seat: gf?.properties.sidlo ?? null,
    population: gf?.properties.pobyosl21 ?? null,
    incumbent: sen
      ? {
          firstName: sen.firstName,
          lastName: sen.lastName,
          titlesBefore: sen.titlesBefore,
          titlesAfter: sen.titlesAfter,
          electedYear: sen.electedYear,
          partyId: sen.partyId,
          running: cands.some((c) => c.defends),
        }
      : null,
    candidates: cands,
  };
});

// strana obhájce může být mimo kandidáty – doplnit do číselníku stran
for (const o of obvody) {
  const p = o.incumbent?.partyId;
  if (p && !parties[p]) {
    parties[p] = { id: p, short: partyNames[p]?.ZKRATKAN8 || p, name: partyNames[p]?.NAZEV_STRN || p };
  }
}

// obvody, kde se letos nevolí – jen kdo tam sedí a kdy se bude volit příště
const others = senators.senators
  .filter((s) => !activeIds.includes(s.obvod))
  .map((s) => {
    parties[s.partyId] ??= {
      id: s.partyId,
      short: partyNames[s.partyId]?.ZKRATKAN8 || s.partyId,
      name: partyNames[s.partyId]?.NAZEV_STRN || s.partyId,
    };
    return {
      id: s.obvod,
      name: s.obvodName,
      nextElection: { 1: 2028, 2: 2030, 0: 2026 }[s.obvod % 3],
      senator: {
        firstName: s.firstName,
        lastName: s.lastName,
        titlesBefore: s.titlesBefore,
        titlesAfter: s.titlesAfter,
        electedYear: s.electedYear,
        partyId: s.partyId,
      },
    };
  });

const out = {
  generatedAt: new Date().toISOString(),
  sources: {
    registry: OPENDATA_BASE + regName,
    codelists: OPENDATA_BASE + cisName,
    incumbentsAsOf: senators.generated,
  },
  election: { id: ELECTION, round1: ['2026-10-09', '2026-10-10'], round2: ['2026-10-16', '2026-10-17'] },
  resultsUrl: `https://volby.gov.cz/appdata/senat/${ELECTION}/odata/vysledky.xml`,
  parties,
  obvody,
  others,
};
fs.writeFileSync(path.join(OUT, 'candidates.json'), JSON.stringify(out));

const features = activeIds.map((id) => {
  const f = geoById.get(id);
  if (!f) throw new Error(`Chybí geometrie obvodu ${id}`);
  return { type: 'Feature', properties: { id, name: obvody.find((o) => o.id === id).name, active: true }, geometry: f.geometry };
});
// ostatní obvody (letos se v nich nevolí) jako šedé pozadí mapy
for (const [id, f] of geoById) {
  if (activeIds.includes(id)) continue;
  features.push({ type: 'Feature', properties: { id, name: f.properties.nazev_vo, active: false }, geometry: f.geometry });
}
fs.writeFileSync(path.join(OUT, 'obvody.geojson'), JSON.stringify({ type: 'FeatureCollection', features }));

// ---------- 5) kontrolní výpis ----------

const women = candidates.filter((c) => c.gender === 'F').length;
console.log('\n=== Hotovo ===');
console.log(`Obvodů: ${obvody.length}, kandidátů: ${candidates.length} (ženy ${women}, muži ${candidates.length - women})`);
console.log(`Geometrie: ${features.length} obvodů (${activeIds.length} aktivních)`);
console.log(`Obhajuje mandát: ${candidates.filter((c) => c.defends).length} z ${obvody.filter((o) => o.incumbent).length} úřadujících senátorů`);
for (const o of obvody.filter((o) => o.incumbent && !o.incumbent.running)) {
  console.log(`  nekandiduje: obvod ${o.id} ${o.name} – ${o.incumbent.firstName} ${o.incumbent.lastName}`);
}
const claimed = candidates.filter((c) => /sen[aá]tor/i.test(c.occupation) && !c.defends && !c.senatorOf);
if (claimed.length) {
  console.log('Povolání zmiňuje „senátor“, ale v seznamu senátorů nesedí (bývalí senátoři / neaktuální snímek?):');
  for (const c of claimed) console.log(`  obvod ${c.obvod}: ${c.firstName} ${c.lastName} – ${c.occupation}`);
}
const uncertain = genderReview.filter((l) => !l.includes('(příjmení)'));
console.log('\nPohlaví odhadnuté ze jména/výchozí (ke kontrole):');
console.log(uncertain.filter((l) => l.startsWith('F')).join('\n'));
fs.writeFileSync(path.join(SRC, 'gender-review.txt'), genderReview.sort().join('\n'));
