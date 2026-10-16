// Živá predikce 2. kola: okrskové dávky ČSÚ (K2) + výsledky 1. kola po okrscích (public/data/okrsky-k1.json) → src/predict.js.
//
// Použití:
//   const p = createPredictor({ k1, fetchBatch });   // fetchBatch(n) vrací text XML dávky nebo null, když ještě neexistuje
//   await p.refresh();                              // dotáhne nové dávky
//   p.predict(obvodId, A, B)                        // { status, ... } nebo null

import { predictObvod, DEFAULT_PRIOR } from './predict.js';

export const K2_BASE = 'https://volby.gov.cz/appdata/senat/20261009/odata/okrsky/K2/';
/** První predikci vydáme, až je sečteno aspoň tolik okrsků obvodu (a aspoň MIN_PRECINCTS okrsků). */
export const MIN_SHARE = 0.05;
export const MIN_PRECINCTS = 5;
/** Při jakém podílu sečtených okrsků obvodu se zaznamená, co predikce tvrdila a jaká byla v tu chvíli skutečnost. */
export const MILESTONES = [0.05, 0.1, 0.25, 0.5, 0.75];

const attr = (s, k) => (s.match(new RegExp(`${k}="([^"]*)"`)) || [])[1];

/** Rozparsuje jednu dávku okrskových výsledků: [{ id, obvod, order, time, V, votes: {číslo: hlasy} }] */
export function parseBatch(xml) {
  if (!xml || xml.includes('<CHYBA')) return [];
  const out = [];
  for (const m of xml.matchAll(/<OKRSEK ([^>]*)>([\s\S]*?)<\/OKRSEK>/g)) {
    const u = m[2].match(/<UCAST_OKRSEK ([^>]*)\/>/)?.[1] ?? '';
    const votes = {};
    for (const h of m[2].matchAll(/<HLASY_OKRSEK ([^>]*)\/>/g)) {
      const v = +attr(h[1], 'HLASY');
      if (v) votes[+attr(h[1], 'PORADOVE_CISLO')] = v;
    }
    out.push({
      id: `${attr(m[1], 'CIS_OBEC')}-${attr(m[1], 'CIS_OKRSEK')}`,
      obvod: +attr(m[1], 'CIS_OBVOD'),
      order: +attr(m[1], 'PORADI_ZPRAC'),
      time: attr(m[1], 'DATUM_CAS_ZPRAC') ?? null,
      V: +attr(u, 'PLATNE_HLASY'),
      votes,
    });
  }
  return out;
}

/** Z kompaktního souboru okrsky-k1.json udělá Map(obvod → [{ id, R, N1, v1 }]). */
export function indexK1(k1) {
  const out = new Map();
  for (const [obvod, rows] of Object.entries(k1.obvody)) {
    out.set(
      +obvod,
      rows
        .map(([id, R, N1, v]) => {
          const v1 = {};
          if (v) for (const part of v.split(',')) {
            const [c, x] = part.split(':');
            v1[+c] = +x;
          }
          return { id, R, N1, v1 };
        })
        .filter((p) => p.R > 0 && p.N1 > 0),
    );
  }
  return out;
}

export function createPredictor({ k1, fetchBatch, prior = DEFAULT_PRIOR }) {
  const byObvod = k1 instanceof Map ? k1 : indexK1(k1);
  const k2 = new Map(); // id -> záznam z poslední dávky (opravený okrsek přepíše starý)
  const batchRows = []; // dávky ve skutečném pořadí (pro přehrání milníků)
  let next = 1;
  let lastBatchAt = null;

  /** Dotáhne všechny nové dávky; vrací počet nově načtených. */
  async function refresh() {
    let loaded = 0;
    for (;;) {
      const batch = [];
      // dokud žádná dávka nedorazila, ptáme se jen na první (ať se zbytečně nevolá 6× do prázdna)
      const width = k2.size ? 6 : 1;
      for (let i = 0; i < width; i++) batch.push(Promise.resolve(fetchBatch(next + i)).catch(() => null));
      const texts = await Promise.all(batch);
      let stop = false;
      for (const t of texts) {
        if (!t || t.includes('<CHYBA')) {
          stop = true;
          break;
        }
        const rows = parseBatch(t);
        batchRows.push(rows);
        for (const r of rows) k2.set(r.id, r);
        loaded++;
        next++;
        lastBatchAt = Date.now();
      }
      if (stop) break;
    }
    return loaded;
  }

  /**
   * Predikce jednoho obvodu pro dvojici kandidátů (čísla ve 2. kole). A je kandidát, jehož podíl se počítá
   * (obvykle vedoucí z 1. kola). Vrací null, dokud není sečten ani jeden okrsek.
   */
  function predict(obvod, A, B) {
    const prec = byObvod.get(obvod);
    if (!prec?.length) return null;
    const rows = prec.map((p) => ({ ...p }));
    const counted = new Map();
    for (const p of prec) {
      const r = k2.get(p.id);
      if (r && r.obvod === obvod) counted.set(p.id, { A2: r.votes[A] ?? 0, B2: r.votes[B] ?? 0 });
    }
    const res = predictObvod(rows, counted, A, B, prior, 1000 + obvod);
    if (!res) return null;
    const publish = res.countedPct >= MIN_SHARE && res.counted >= MIN_PRECINCTS;
    return { ...res, publish, nextBatch: next, lastBatchAt };
  }

  /** Vedoucí z 1. kola (z úplných okrskových dat) – určuje, kdo je „A“. */
  function leaderOfFirstRound(obvod, c1, c2) {
    let a = 0;
    let b = 0;
    for (const p of byObvod.get(obvod) ?? []) {
      a += p.v1[c1] ?? 0;
      b += p.v1[c2] ?? 0;
    }
    return a >= b ? [c1, c2] : [c2, c1];
  }

  /** Výsledek 1. kola dvojice v obvodu z okrskových dat: { a, b (kandidáti, a = vedoucí), aPct, bPct, lead (p. b.), prob } */
  function firstRound(obvod, c1, c2) {
    let a = 0;
    let b = 0;
    let n = 0;
    const [A, B] = leaderOfFirstRound(obvod, c1, c2);
    for (const q of byObvod.get(obvod) ?? []) {
      a += q.v1[A] ?? 0;
      b += q.v1[B] ?? 0;
      n += q.N1;
    }
    const aPct = (a / n) * 100;
    const bPct = (b / n) * 100;
    return { a: A, b: B, aPct, bPct, lead: aPct - bPct, prob: preVoteProb(aPct - bPct) };
  }

  /**
   * Přehraje sčítání dávku po dávce a pro každý práh (5, 10, 25… % sečtených okrsků obvodu) zaznamená, co predikce tvrdila
   * v okamžiku, kdy byl práh překonán, a jaká byla tehdy skutečnost (dosavadní podíl ze sečtených hlasů). Nic se nedoladuje:
   * je to stejný model a stejná data v tom pořadí, v jakém je ČSÚ vydával.
   */
  function milestones(obvod, A, B, thresholds = MILESTONES) {
    const prec = byObvod.get(obvod);
    if (!prec?.length) return [];
    const ids = new Set(prec.map((q) => q.id));
    const counted = new Map();
    const out = [];
    let ti = 0;
    batchRows.forEach((batch, bi) => {
      let t = null;
      for (const r of batch) {
        if (r.obvod !== obvod || !ids.has(r.id)) continue;
        counted.set(r.id, { A2: r.votes[A] ?? 0, B2: r.votes[B] ?? 0 });
        if (r.time && (!t || r.time > t)) t = r.time;
      }
      const frac = counted.size / prec.length;
      while (ti < thresholds.length && frac >= thresholds[ti]) {
        const res = predictObvod(prec.map((q) => ({ ...q })), counted, A, B, prior, 1000 + obvod);
        if (res) {
          out.push({
            prah: thresholds[ti],
            davka: bi + 1,
            cas: t,
            counted: res.counted,
            total: res.total,
            countedPct: res.countedPct,
            share: res.share,
            lo: res.lo,
            hi: res.hi,
            pWin: res.pWin,
            current: res.currentShare,
            publish: res.countedPct >= MIN_SHARE && res.counted >= MIN_PRECINCTS,
          });
        }
        ti++;
      }
    });
    return out;
  }

  return { refresh, predict, leaderOfFirstRound, firstRound, milestones, get batches() { return next - 1; }, get precincts() { return k2.size; } };
}

/**
 * Předběžná pravděpodobnost, že vedoucí z 1. kola vyhraje 2. kolo, jen z jeho náskoku (procentní body z platných hlasů 1. kola).
 * Logistická regrese na 97 obvodech z druhých kol 2018–2024: logit = −0,11 + 0,225 × náskok.
 * Zpětně (leave-one-year-out) Brier 0,154 (základna „vedoucí vyhraje“ 0,176), kalibrace: odhad 52 % → skutečně 59 %, 70 → 72, 94 → 90.
 */
// ořezáno na 3–97 %: v nejvyšším pásmu zpětného testu byl odhad 94 % a skutečnost 90 %, takže vyšší jistotu před hlasováním netvrdíme
export const preVoteProb = (leadPp) => Math.min(0.97, Math.max(0.03, 1 / (1 + Math.exp(-(-0.11 + 0.225 * leadPp)))));

/** Slovní zařazení jistoty predikce pro text na webu (bez vymýšlení: jen z čísel modelu). */
export function verdict(p, nameA, nameB) {
  if (!p?.publish) return null;
  const win = p.pWin >= 0.5 ? nameA : nameB;
  const prob = p.pWin >= 0.5 ? p.pWin : 1 - p.pWin;
  // Pojistka: při velmi málo sečtených okrscích (< 10 %) zpětný test občas chyboval i u vysoké pravděpodobnosti,
  // proto se takový výrok nikdy nepodává jako „téměř jistý“.
  const early = p.countedPct < 0.1;
  let level = 'těsné, zatím nejde říct';
  if (prob >= 0.99 && !early) level = 'téměř jisté';
  else if (prob >= 0.95 && !early) level = 'velmi pravděpodobné';
  else if (prob >= 0.8) level = early && prob >= 0.95 ? 'pravděpodobné, zatím je sečteno velmi málo okrsků' : 'pravděpodobné';
  else if (prob >= 0.65) level = 'mírný náskok';
  return { winner: win, prob, level, sure: prob >= 0.95 && !early };
}
