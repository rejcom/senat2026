// Predikce výsledku 2. kola senátních voleb z už sečtených okrsků.
//
// Princip (jeden obvod, dva kandidáti A a B):
//  - V každém okrsku známe výsledek 1. kola (všech kandidátů) i počet voličů v seznamu. Z už sečtených okrsků se naučí,
//    jak se z 1. kola stalo 2. kolo, a tohle se aplikuje na okrsky, které zatím sečtené nejsou.
//    Tím se opravuje i zkreslení pořadí sčítání (nejdřív malé vesnice, města až nakonec).
//  - Podíl hlasů pro A v okrsku: logistická regrese na (logit dvojkandidátního podílu A:B z 1. kola, podíl hlasů ostatních
//    kandidátů z 1. kola, velikost okrsku). Je bayesovská (hřebenová) – s malým počtem sečtených okrsků drží blízko apriorních
//    hodnot z historie, s rostoucím počtem se řídí daty z obvodu.
//  - Počet platných hlasů ve 2. kole: log(V2/N1) = δ + γ·velikost, rovněž s apriorem z historie.
//  - Nejistota: simulace (Monte Carlo) z posteriorního rozdělení parametrů + náhodného rozptylu nesečtených okrsků
//    (včetně nadměrného rozptylu oproti binomickému). Výstup: odhad, 90% interval, pravděpodobnost výhry A.
//
// Čistý modul bez závislostí (běží v prohlížeči i v Node), aby šel stejný kód použít na zpětný test (scripts/predikce-lab.mjs).

const clip = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const expit = (x) => 1 / (1 + Math.exp(-x));
const logit = (p) => Math.log(p / (1 - p));

/** Apriorní hodnoty a rozptyly (laděno zpětným testem, viz scripts/predikce-lab.mjs a doc/PREDIKCE.md). */
export const DEFAULT_PRIOR = {
  // koeficienty logistické regrese: [konstanta, logit(A:B), podíl ostatních, velikost okrsku (centrovaný log)]
  features: ['const', 'logit', 'other', 'size'],
  theta0: [0.146, 0.7, -0.16, 0.014],
  thetaSd: [0.36, 0.16, 0.94, 0.075],
  obecShrink: 0, // 0 = vypnuto; jinak κ ve vzorci n/(n+κ) pro přenos rezidua v rámci obce
  sharedSd: 0.06, // společná náhodná odchylka všech nesečtených okrsků (logit); zachycuje např. velké město sečtené nakonec
  covInflate: 1.25, // násobek nejistoty parametrů regrese
  noiseInflate: 1, // násobek náhodného rozptylu nesečtených okrsků
  // dispersion (kvazibinomický rozptyl) – apriorní hodnota a její „váha“ v pseudopozorováních
  phi0: 2,
  phiWeight: 12,
  // log(V2/N1) = δ + γ·z
  delta0: -0.77,
  deltaSd: 0.22,
  gammaSd: 0.1,
  sigmaV0: 0.23, // rezidualní směrodatná odchylka log počtu hlasů v okrsku
  draws: 800,
};

function solve(Aflat, b, n) {
  // Gaussova eliminace pro malou symetrickou matici n×n (n ≤ 6)
  const M = Array.from({ length: n }, (_, i) => [...Aflat.slice(i * n, i * n + n), b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-12;
    for (let j = c; j <= n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c];
      if (!f) continue;
      for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((row) => row[n]);
}

function invert(Aflat, n) {
  const cols = [];
  for (let k = 0; k < n; k++) {
    const e = Array(n).fill(0);
    e[k] = 1;
    cols.push(solve(Aflat, e, n));
  }
  const out = new Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out[i * n + j] = cols[j][i];
  return out;
}

function cholesky(Aflat, n) {
  const L = new Array(n * n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = Aflat[i * n + j];
      for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
      L[i * n + j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / L[j * n + j];
    }
  }
  return L;
}

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
function normal(rand) {
  let u = 0;
  let v = 0;
  while (!u) u = rand();
  while (!v) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Rysy okrsků z 1. kola.
 * prec: [{ id, R (voličů v seznamu), N1 (platné hlasy 1. kolo), v1: { [cislo]: hlasy } }]
 */
function features(prec, A, B, meanLogR, names, meanT) {
  return prec.map((p) => {
    const a = p.v1[A] ?? 0;
    const b = p.v1[B] ?? 0;
    const n = Math.max(p.N1, 1);
    const sigma = (a + 0.5) / (a + b + 1); // dvojkandidátní podíl s mírnou regularizací proti 0 a 1
    const other = clip((p.N1 - a - b) / n, 0, 1);
    const z = Math.log(Math.max(p.R, 1)) - meanLogR;
    const all = {
      const: 1,
      logit: logit(clip(sigma, 0.01, 0.99)),
      other,
      size: z,
      a: a / n - 0.35,
      b: b / n - 0.25,
      t1: logit(clip(p.N1 / Math.max(p.R, 1), 0.02, 0.98)) - meanT,
    };
    return { x: names.map((nm) => all[nm]), z, n: p.N1 };
  });
}

/**
 * Predikce konečného výsledku obvodu.
 * @param prec  všechny okrsky obvodu (viz features)
 * @param counted  Map(id → { A2, B2 }) už sečtené okrsky 2. kola
 * @param A,B čísla kandidátů ve 2. kole (A = kandidát, pro kterého se počítá podíl)
 * @returns null (nic sečteno) nebo { share, lo, hi, pWin, countedPct, countedVotesPct, expectedVotes }
 */
export function predictObvod(prec, counted, A, B, prior = DEFAULT_PRIOR, seed = 12345) {
  const names = prior.features;
  const k = names.length;
  const meanLogR = prec.reduce((s, p) => s + Math.log(Math.max(p.R, 1)), 0) / prec.length;
  const meanT = prec.reduce((s, p) => s + logit(clip(p.N1 / Math.max(p.R, 1), 0.02, 0.98)), 0) / prec.length;
  const F = features(prec, A, B, meanLogR, names, meanT);
  const idx = new Map(prec.map((p, i) => [p.id, i]));
  const C = []; // indexy sečtených okrsků
  const U = []; // nesečtené
  prec.forEach((p, i) => (counted.has(p.id) ? C.push(i) : U.push(i)));
  // allowEmpty: předběžný odhad před 2. kolem bez jediného sečteného okrsku (jen apriorní zkušenost + výsledky 1. kola)
  if (!C.length && !prior.allowEmpty) return null;

  const sumA = C.reduce((s, i) => s + counted.get(prec[i].id).A2, 0);
  const sumB = C.reduce((s, i) => s + counted.get(prec[i].id).B2, 0);
  const countedVotes = sumA + sumB;
  if (countedVotes === 0 && !prior.allowEmpty) return null;

  // ---- 1) logistická regrese podílu A (IRLS s apriorem) ----
  const y = C.map((i) => counted.get(prec[i].id).A2);
  const V = C.map((i) => counted.get(prec[i].id).A2 + counted.get(prec[i].id).B2);
  const P = prior.thetaSd.map((s) => 1 / (s * s));
  let theta = [...prior.theta0];
  let phi = prior.phi0;
  let H = null;
  for (let it = 0; it < 12; it++) {
    const XtWX = new Array(k * k).fill(0);
    const XtWz = new Array(k).fill(0);
    C.forEach((i, c) => {
      const x = F[i].x;
      const eta = clip(x.reduce((s, xv, j) => s + xv * theta[j], 0), -8, 8);
      const mu = expit(eta);
      const w = Math.max(V[c] * mu * (1 - mu), 1e-6) / phi;
      const z = eta + (y[c] - V[c] * mu) / Math.max(V[c] * mu * (1 - mu), 1e-6);
      for (let a = 0; a < k; a++) {
        XtWz[a] += w * x[a] * z;
        for (let b = 0; b < k; b++) XtWX[a * k + b] += w * x[a] * x[b];
      }
    });
    for (let a = 0; a < k; a++) {
      XtWX[a * k + a] += P[a];
      XtWz[a] += P[a] * prior.theta0[a];
    }
    H = XtWX;
    const next = solve(XtWX, XtWz, k);
    const delta = next.reduce((s, v, j) => s + Math.abs(v - theta[j]), 0);
    theta = next;
    // nadměrný rozptyl z Pearsonova chí-kvadrát (s apriorem jako pseudopozorováními)
    let chi2 = 0;
    C.forEach((i, c) => {
      const eta = clip(F[i].x.reduce((s, xv, j) => s + xv * theta[j], 0), -8, 8);
      const mu = expit(eta);
      chi2 += (y[c] - V[c] * mu) ** 2 / Math.max(V[c] * mu * (1 - mu), 1e-6);
    });
    phi = clip((prior.phi0 * prior.phiWeight + chi2) / (prior.phiWeight + C.length), 1, 30);
    if (delta < 1e-5) break;
  }
  const cov = invert(H, k);
  const L = cholesky(cov, k);

  // ---- 2) počet hlasů ve 2. kole: log(V2/N1) = δ + γ·z ----
  const ly = C.map((i, c) => Math.log(Math.max(V[c], 1) / Math.max(prec[i].N1, 1)));
  let sw = 0;
  let sz = 0;
  let szz = 0;
  let sy = 0;
  let szy = 0;
  C.forEach((i, c) => {
    const w = Math.max(prec[i].N1, 1); // těžší okrsky váží víc
    const z = F[i].z;
    sw += w;
    sz += w * z;
    szz += w * z * z;
    sy += w * ly[c];
    szy += w * z * ly[c];
  });
  const sv2 = prior.sigmaV0 ** 2;
  // matice přesnosti (v jednotkách 1/σ²; váha okrsku w ~ normalizovaná na průměrnou velikost)
  const meanN = prec.reduce((s, p) => s + Math.max(p.N1, 1), 0) / prec.length;
  const a11 = sw / meanN / sv2 + 1 / prior.deltaSd ** 2;
  const a12 = sz / meanN / sv2;
  const a22 = szz / meanN / sv2 + 1 / prior.gammaSd ** 2;
  const b1 = sy / meanN / sv2 + prior.delta0 / prior.deltaSd ** 2;
  const b2 = szy / meanN / sv2;
  const det = a11 * a22 - a12 * a12;
  const dHat = (a22 * b1 - a12 * b2) / det;
  const gHat = (-a12 * b1 + a11 * b2) / det;
  const covD = [a22 / det, -a12 / det, -a12 / det, a11 / det];
  const LD = cholesky(covD, 2);
  // rezidua
  let rss = 0;
  C.forEach((i, c) => {
    const r = ly[c] - dHat - gHat * F[i].z;
    rss += r * r;
  });
  const sigmaV = Math.sqrt((prior.sigmaV0 ** 2 * 6 + rss) / (6 + C.length));

  // ---- 2b) rezidua sečtených okrsků po obcích (města a obce mají podobné chování svých okrsků) ----
  const obecAdj = new Map();
  if (prior.obecShrink > 0) {
    const acc = new Map();
    C.forEach((i, c) => {
      const eta = F[i].x.reduce((s2, xv, j) => s2 + xv * theta[j], 0);
      const emp = logit(clip((y[c] + 0.5) / (V[c] + 1), 0.005, 0.995));
      const o = String(prec[i].id).split('-')[0];
      const e = acc.get(o) ?? { s: 0, n: 0 };
      e.s += emp - eta;
      e.n++;
      acc.set(o, e);
    });
    for (const [o, e] of acc) obecAdj.set(o, (e.s / e.n) * (e.n / (e.n + prior.obecShrink)));
  }

  // ---- 3) simulace nesečtených okrsků ----
  const rand = rng(seed);
  const M = prior.draws;
  const shares = new Array(M);
  let wins = 0;
  const NU = U.length;
  let expVotes = 0;
  for (let m = 0; m < M; m++) {
    const e = Array.from({ length: k }, () => normal(rand));
    const th = theta.map((t, j) => {
      let s = t;
      for (let q = 0; q <= j; q++) s += prior.covInflate * L[j * k + q] * e[q];
      return s;
    });
    const d1 = normal(rand);
    const d2 = normal(rand);
    const shared = prior.sharedSd * normal(rand);
    const dd = dHat + LD[0] * d1;
    const gg = gHat + LD[2] * d1 + LD[3] * d2;
    let a2 = sumA;
    let b2s = sumB;
    for (let q = 0; q < NU; q++) {
      const i = U[q];
      const f = F[i];
      let eta = shared + (obecAdj.get(String(prec[i].id).split('-')[0]) ?? 0);
      for (let j = 0; j < k; j++) eta += f.x[j] * th[j];
      const mu = expit(clip(eta, -8, 8));
      const v2 = Math.max(0, Math.max(prec[i].N1, 0) * Math.exp(dd + gg * f.z + sigmaV * normal(rand)));
      const sd = prior.noiseInflate * Math.sqrt(phi * v2 * mu * (1 - mu));
      const av = clip(v2 * mu + sd * normal(rand), 0, v2);
      a2 += av;
      b2s += v2 - av;
      if (m === 0) expVotes += v2;
    }
    shares[m] = a2 / (a2 + b2s);
    if (shares[m] > 0.5) wins++;
  }
  shares.sort((u, v) => u - v);
  const q = (p) => shares[clip(Math.round(p * (M - 1)), 0, M - 1)];
  const totalVotes = countedVotes + expVotes;
  return {
    share: q(0.5),
    lo: q(0.05),
    hi: q(0.95),
    pWin: wins / M,
    countedPct: C.length / prec.length,
    countedVotesPct: countedVotes / totalVotes,
    counted: C.length,
    total: prec.length,
    currentShare: countedVotes ? sumA / countedVotes : null,
    theta,
    phi,
    delta: dHat,
    sigmaV,
    gamma: gHat,
  };
}
