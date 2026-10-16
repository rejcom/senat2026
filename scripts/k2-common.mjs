// Společné pro záznam a vyhodnocení 2. kola: okrsky 1. kola, kandidáti a dávky ČSÚ uložené na disku.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexK1, K2_BASE } from '../src/predikce.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_DIR = path.join(ROOT, '.cache', 'k2-2026');

export function args() {
  const a = process.argv.slice(2);
  const get = (k, d) => {
    const i = a.indexOf(k);
    return i >= 0 ? a[i + 1] : d;
  };
  return { dir: path.resolve(get('--dir', DEFAULT_DIR)), base: get('--base', K2_BASE), demo: Number(get('--demo', 0)) || 0, has: (k) => a.includes(k) };
}

export const loadK1 = () => indexK1(JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'okrsky-k1.json'), 'utf8')));

/** Map(obvod → { name, cand: Map(číslo → „Jméno Příjmení (strana)“) }) */
export function loadCandidates() {
  const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'candidates.json'), 'utf8'));
  return new Map(
    c.obvody.map((o) => [
      o.id,
      { name: o.name, cand: new Map(o.candidates.map((k) => [k.no, { name: `${k.firstName} ${k.lastName}`, party: k.listName }])) },
    ]),
  );
}

export const batchFile = (dir, n) => path.join(dir, `vysledky_okrsky_${String(n).padStart(5, '0')}.xml`);
export const timesFile = (dir) => path.join(dir, 'casy.json');
export const readTimes = (dir) => (fs.existsSync(timesFile(dir)) ? JSON.parse(fs.readFileSync(timesFile(dir), 'utf8')) : {});

/** Uložené dávky 1…n bez mezer. */
export function readSavedBatches(dir) {
  const out = [];
  for (let n = 1; fs.existsSync(batchFile(dir, n)); n++) out.push(fs.readFileSync(batchFile(dir, n), 'utf8'));
  return out;
}

/** Stáhne dávku n z ČSÚ; null, když ještě neexistuje. */
export async function fetchRemote(base, n) {
  const r = await fetch(`${base}vysledky_okrsky_${String(n).padStart(5, '0')}.xml`, { cache: 'no-store' });
  if (!r.ok) return null;
  const t = await r.text();
  return t.includes('<CHYBA') || !t.includes('<OKRSEK') ? null : t;
}

/** Dvojice kandidátů ve 2. kole podle dávek (ve 2. kole mají hlasy jen dva postupující). */
export function pairsFromRows(rows) {
  const m = new Map();
  for (const r of rows) {
    const s = m.get(r.obvod) ?? new Set();
    for (const c of Object.keys(r.votes)) s.add(+c);
    m.set(r.obvod, s);
  }
  return new Map([...m].filter(([, s]) => s.size === 2).map(([o, s]) => [o, [...s]]));
}
