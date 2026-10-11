// Laboratoř pro predikci 2. kola: zpětný test modelu (src/predict.js) na okrskových výsledcích minulých senátních voleb.
//
//   node scripts/predikce-lab.mjs fit                 – jak vypadají parametry modelu při znalosti úplných dat (pro apriory)
//   node scripts/predikce-lab.mjs eval [--prior JSON] – přesnost a spolehlivost intervalů při 3–75 % sečtených okrsků
//
// Okrskové výsledky obou kol z archivu ČSÚ (2018, 2020, 2022, 2024); stahuje se do .cache/ (není v gitu).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { predictObvod, DEFAULT_PRIOR } from '../src/predict.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.cache', 'senat-archiv');
fs.mkdirSync(CACHE, { recursive: true });

const SOURCES = {
  2018: 'https://volby.gov.cz/opendata/se2018/SENAT2018_data_20181013_k2_csv.zip',
  2020: 'https://volby.gov.cz/opendata/se2020/SENAT2020_data_20201010_k2_csv.zip',
  2022: 'https://volby.gov.cz/opendata/se2022/SE2022_data_20221001_k2_csv.zip',
  2024: 'https://volby.gov.cz/opendata/se2024/SE2024data20240928_csv.zip',
};

async function loadCsv(year) {
  const file = path.join(CACHE, `set5-${year}.csv`);
  if (!fs.existsSync(file)) {
    const res = await fetch(SOURCES[year], { headers: { 'User-Agent': 'senat2026-lab' } });
    if (!res.ok) throw new Error(`${res.status} ${SOURCES[year]}`);
    const zip = unzipSync(new Uint8Array(await res.arrayBuffer()));
    const key = Object.keys(zip).find((k) => /(^|\/)set5\.csv$/.test(k) && !k.includes('csv_od'));
    fs.writeFileSync(file, zip[key]);
  }
  return new TextDecoder('windows-1250').decode(fs.readFileSync(file));
}

/** Vrátí obvody s druhým kolem: { year, obvod, A, B, prec: [{ id, R, N1, v1, A2, B2 }] } (A = vedoucí z 1. kola). */
async function loadElection(year) {
  const lines = (await loadCsv(year)).trim().split(/\r?\n/);
  const h = lines[0].split(';');
  const ix = (k) => h.indexOf(k);
  const h1 = ix('HLASY_01');
  const rows = lines.slice(1).map((l) => l.split(';'));
  const byObvod = new Map();
  for (const r of rows) {
    const o = +r[ix('OBVOD')];
    const kolo = +r[ix('KOLO')];
    const id = `${r[ix('OBEC')]}-${r[ix('OKRSEK')]}`;
    const votes = {};
    for (let c = 0; c < 22; c++) {
      const v = +r[h1 + c];
      if (v) votes[c + 1] = v;
    }
    const rec = { id, R: +r[ix('VOL_SEZNAM')], N: +r[ix('PL_HL_CELK')], votes };
    if (!byObvod.has(o)) byObvod.set(o, { 1: new Map(), 2: new Map() });
    byObvod.get(o)[kolo].set(id, rec);
  }
  const out = [];
  for (const [obvod, k] of byObvod) {
    if (!k[2].size) continue;
    const tot2 = {};
    for (const p of k[2].values()) for (const [c, v] of Object.entries(p.votes)) tot2[c] = (tot2[c] ?? 0) + v;
    const two = Object.entries(tot2).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([c]) => +c);
    if (two.length < 2) continue;
    const tot1 = {};
    for (const p of k[1].values()) for (const [c, v] of Object.entries(p.votes)) tot1[c] = (tot1[c] ?? 0) + v;
    const [A, B] = (tot1[two[0]] ?? 0) >= (tot1[two[1]] ?? 0) ? two : [two[1], two[0]];
    const prec = [];
    for (const [id, p2] of k[2]) {
      const p1 = k[1].get(id);
      if (!p1 || !p1.R || !p1.N) continue;
      prec.push({ id, R: p1.R, N1: p1.N, v1: p1.votes, A2: p2.votes[A] ?? 0, B2: p2.votes[B] ?? 0 });
    }
    if (prec.length < 20) continue;
    out.push({ year, obvod, A, B, prec });
  }
  return out;
}

// ---------- pořadí sčítání ----------
// Skutečné pořadí máme jen u 2024 (dávky okrskových výsledků ČSÚ). U starších voleb se simuluje.

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

async function loadRealOrder2024() {
  const file = path.join(CACHE, 'order-2024-k2.json');
  if (!fs.existsSync(file)) {
    const order = {};
    for (let n = 1; n < 500; n++) {
      const url = `https://volby.gov.cz/appdata/senat/20240920/odata/okrsky/K2/vysledky_okrsky_${String(n).padStart(5, '0')}.xml`;
      const res = await fetch(url, { headers: { 'User-Agent': 'senat2026-lab' } });
      if (!res.ok) break;
      const xml = await res.text();
      if (xml.includes('<CHYBA')) break;
      for (const m of xml.matchAll(/<OKRSEK ([^>]*)>/g)) {
        const g = (k) => (m[1].match(new RegExp(`${k}="([^"]*)"`)) || [])[1];
        const id = `${g('CIS_OBEC')}-${g('CIS_OKRSEK')}`;
        if (!(id in order)) order[id] = +g('PORADI_ZPRAC');
      }
    }
    fs.writeFileSync(file, JSON.stringify(order));
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const REAL = await loadRealOrder2024();

const ORDERS = {
  random: (o, r) => o.prec.map((p) => ({ p, k: r() })),
  small: (o, r) => o.prec.map((p) => ({ p, k: Math.log(p.R) + 0.6 * gauss(r) })),
  smallStrict: (o, r) => o.prec.map((p) => ({ p, k: Math.log(p.R) + 0.2 * gauss(r) })),
  real: (o) => o.prec.map((p) => ({ p, k: REAL[p.id] ?? 1e9 })),
};
const orderBy = (name, o, seed) => ORDERS[name](o, rng(seed)).sort((a, b) => a.k - b.k).map((x) => x.p);

// ---------- modely ----------

const BASE_FEATS = ['const', 'logit', 'other', 'size'];
const MODELS = {
  naive: null,
  simple: { features: ['const', 'logit'] },
  base: { features: BASE_FEATS },
  ext: { features: [...BASE_FEATS, 'a', 't1'] },
  baseObec: { features: BASE_FEATS, obecShrink: 3 },
  extObec: { features: [...BASE_FEATS, 'a', 't1'], obecShrink: 3 },
};

/** Apriory empirickým Bayesem z úplných dat jiných voleb (flat prior fit na každém obvodu). */
function fitPrior(trainData, features, extra = {}) {
  const flat = {
    ...DEFAULT_PRIOR,
    features,
    theta0: features.map(() => 0),
    thetaSd: features.map(() => 5),
    deltaSd: 5,
    gammaSd: 5,
    phiWeight: 0.01,
    draws: 50,
  };
  const fits = trainData
    .map((o) => {
      const counted = new Map(o.prec.map((p) => [p.id, { A2: p.A2, B2: p.B2 }]));
      counted.delete(o.prec[0].id);
      return predictObvod(o.prec, counted, o.A, o.B, flat, 1);
    })
    .filter(Boolean);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = (a) => Math.sqrt(a.reduce((s, v) => s + (v - mean(a)) ** 2, 0) / (a.length - 1));
  const th = features.map((_, j) => fits.map((f) => f.theta[j]));
  return {
    ...DEFAULT_PRIOR,
    features,
    theta0: th.map(mean),
    thetaSd: th.map((a) => Math.max(sd(a), 0.05)),
    phi0: mean(fits.map((f) => f.phi)),
    delta0: mean(fits.map((f) => f.delta)),
    deltaSd: Math.max(sd(fits.map((f) => f.delta)), 0.08),
    gammaSd: Math.max(sd(fits.map((f) => f.gamma)), 0.03),
    sigmaV0: mean(fits.map((f) => f.sigmaV)),
    draws: 300,
    ...extra,
  };
}

function erf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}
const norm = (x) => 0.5 * (1 + erf(x / Math.SQRT2));

function predictWith(modelName, prior, o, counted, seed) {
  if (modelName === 'naive') {
    let a = 0;
    let v = 0;
    for (const c of counted.values()) {
      a += c.A2;
      v += c.A2 + c.B2;
    }
    if (!v) return null;
    const s = a / v;
    const se = Math.sqrt((s * (1 - s)) / v);
    return { share: s, currentShare: s, lo: s - 1.645 * se, hi: s + 1.645 * se, pWin: norm((s - 0.5) / se) };
  }
  return predictObvod(o.prec, counted, o.A, o.B, prior, seed);
}

const FRACS = (() => {
  const i = process.argv.indexOf('--fracs');
  return i > 0 ? process.argv[i + 1].split(',').map(Number) : [0.03, 0.05, 0.1, 0.2, 0.35, 0.5, 0.75];
})();
const truth = (o) => {
  let a = 0;
  let b = 0;
  for (const p of o.prec) {
    a += p.A2;
    b += p.B2;
  }
  return a / (a + b);
};

const newAcc = () => ({ n: 0, se: 0, ae: 0, cover: 0, width: 0, brier: 0, conf: 0, confWrong: 0 });

/** Leave-one-year-out: apriory z ostatních let, vyhodnocení na vynechaném roce. */
function evaluateModel(modelName, data, orders, extra = {}) {
  const out = {};
  const years = [...new Set(data.map((d) => d.year))];
  const priors = {};
  if (modelName !== 'naive') {
    for (const y of years) priors[y] = fitPrior(data.filter((d) => d.year !== y), MODELS[modelName].features, { ...MODELS[modelName], ...extra });
  }
  for (const ord of orders) {
    for (const f of FRACS) {
      const acc = newAcc();
      data.forEach((o, di) => {
        if (ord === 'real' && o.year !== 2024) return;
        const T = truth(o);
        const seq = orderBy(ord, o, 1000 + di);
        const nC = Math.max(2, Math.round(f * seq.length));
        const counted = new Map(seq.slice(0, nC).map((p) => [p.id, { A2: p.A2, B2: p.B2 }]));
        const r = predictWith(modelName, priors[o.year], o, counted, 7 + di);
        if (!r) return;
        acc.n++;
        acc.se += ((r.share - T) * 100) ** 2;
        acc.ae += Math.abs(r.share - T) * 100;
        acc.cover += T >= r.lo && T <= r.hi ? 1 : 0;
        acc.width += (r.hi - r.lo) * 100;
        const win = T > 0.5 ? 1 : 0;
        acc.brier += (r.pWin - win) ** 2;
        if (r.pWin > 0.95 || r.pWin < 0.05) {
          acc.conf++;
          if ((r.pWin > 0.5 ? 1 : 0) !== win) acc.confWrong++;
        }
      });
      out[`${ord}|${f}`] = acc;
    }
  }
  return out;
}

const fmt = (a, k) => {
  if (!a || !a.n) return '–';
  switch (k) {
    case 'rmse': return Math.sqrt(a.se / a.n).toFixed(2);
    case 'cover': return `${((a.cover / a.n) * 100).toFixed(0)}%`;
    case 'width': return (a.width / a.n).toFixed(1);
    case 'brier': return (a.brier / a.n).toFixed(3);
    case 'conf': return `${a.confWrong}/${a.conf}`;
    default: return '';
  }
};

async function main() {
  const data = [];
  for (const y of Object.keys(SOURCES)) data.push(...(await loadElection(+y)));
  console.log(`načteno ${data.length} druhých kol, ${data.reduce((s, d) => s + d.prec.length, 0)} okrsků; reálné pořadí 2024: ${Object.keys(REAL).length} okrsků`);
  if (process.argv[2] === 'prior') {
    const p = fitPrior(data, BASE_FEATS, {});
    const r = (x) => Math.round(x * 1000) / 1000;
    console.log(JSON.stringify({ theta0: p.theta0.map(r), thetaSd: p.thetaSd.map(r), phi0: r(p.phi0), delta0: r(p.delta0), deltaSd: r(p.deltaSd), gammaSd: r(p.gammaSd), sigmaV0: r(p.sigmaV0) }, null, 1));
    return;
  }
  const names = (process.argv[3] ?? Object.keys(MODELS).join(',')).split(',');
  const orders = (process.argv[4] ?? 'random,small,real').split(',');
  const fa = process.argv.indexOf('--fracs');
  const showFracs = fa > 0 ? process.argv[fa + 1].split(',').map(Number) : [0.05, 0.1, 0.2, 0.35, 0.5];
  const extraArg = process.argv.indexOf('--extra');
  const extra = extraArg > 0 ? JSON.parse(process.argv[extraArg + 1]) : {};
  const results = {};
  for (const m of names) results[m] = evaluateModel(m, data, orders, extra);
  for (const ord of orders) {
    for (const metric of ['rmse', 'cover', 'width', 'brier', 'conf']) {
      const note = { rmse: '(procentní body)', cover: '(nominálně 90 %)', width: '(šířka 90% intervalu, p. b.)', brier: '(Brier skóre, méně = lépe)', conf: '(jistě špatně / jistých výroků, p>95 %)' }[metric];
      console.log(`\n== ${ord} · ${metric} ${note}`);
      console.log(['model', ...showFracs.map((f) => `${f * 100}%`)].join('\t'));
      for (const m of names) console.log([m, ...showFracs.map((f) => fmt(results[m][`${ord}|${f}`], metric))].join('\t'));
    }
  }
}

await main();
