// Stáhne okrskové výsledky 1. kola senátních voleb 2026 (všechny dávky ČSÚ) a uloží je kompaktně pro predikci 2. kola.
//
//   npm run data:okrsky     (výstup: public/data/okrsky-k1.json)
//
// Dávky jsou přírůstkové: každá obsahuje nově zpracované okrsky. Opravený okrsek (OPAKOVANE="1") přepisuje starší záznam.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'data', 'okrsky-k1.json');
const BASE = 'https://volby.gov.cz/appdata/senat/20261009/odata/okrsky/K1/';

const attr = (s, k) => (s.match(new RegExp(`${k}="([^"]*)"`)) || [])[1];

const precincts = new Map(); // "obec-okrsek" -> { obvod, R, N, v, order }
let celkem = 0;
let zprac = 0;
for (let n = 1; n < 2000; n++) {
  const res = await fetch(`${BASE}vysledky_okrsky_${String(n).padStart(5, '0')}.xml`, { headers: { 'User-Agent': 'senat2026-build' } });
  if (!res.ok) break;
  const xml = await res.text();
  if (xml.includes('<CHYBA')) break;
  const davka = xml.match(/<DAVKA ([^>]*)\/>/)?.[1] ?? '';
  celkem = +attr(davka, 'OKRSKY_CELKEM') || celkem;
  zprac = +attr(davka, 'OKRSKY_ZPRAC') || zprac;
  for (const m of xml.matchAll(/<OKRSEK ([^>]*)>([\s\S]*?)<\/OKRSEK>/g)) {
    const id = `${attr(m[1], 'CIS_OBEC')}-${attr(m[1], 'CIS_OKRSEK')}`;
    const u = m[2].match(/<UCAST_OKRSEK ([^>]*)\/>/)?.[1] ?? '';
    const v = {};
    for (const h of m[2].matchAll(/<HLASY_OKRSEK ([^>]*)\/>/g)) {
      const votes = +attr(h[1], 'HLASY');
      if (votes) v[+attr(h[1], 'PORADOVE_CISLO')] = votes;
    }
    precincts.set(id, {
      obvod: +attr(m[1], 'CIS_OBVOD'),
      R: +attr(u, 'ZAPSANI_VOLICI'),
      N: +attr(u, 'PLATNE_HLASY'),
      v,
      order: +attr(m[1], 'PORADI_ZPRAC'),
    });
  }
  if (n % 20 === 0) console.log(`  dávka ${n}: ${precincts.size} okrsků`);
}

const obvody = {};
for (const [id, p] of precincts) {
  (obvody[p.obvod] ??= []).push([id, p.R, p.N, Object.entries(p.v).map(([c, x]) => `${c}:${x}`).join(',')]);
}
fs.writeFileSync(OUT, JSON.stringify({ election: '20261009', okrskuCelkem: celkem, okrskuZpracovano: zprac, vygenerovano: new Date().toISOString(), obvody }));
console.log(`Hotovo: ${precincts.size} okrsků v ${Object.keys(obvody).length} obvodech (ČSÚ uvádí ${zprac}/${celkem} zpracováno) → ${path.relative(ROOT, OUT)}`);
