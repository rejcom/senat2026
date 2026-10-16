// Vyhodnocení predikce 2. kola po sečtení: přehraje dávky ČSÚ ve skutečném pořadí stejným kódem jako web (src/predikce.js)
// a porovná, co predikce tvrdila při 5, 10, 25, 50 a 75 % sečtených okrsků obvodu, s konečným výsledkem.
// Srovnává i s prostým přepočtem („dosavadní procento“) a s předběžným odhadem před hlasováním.
//
//   node scripts/k2-vyhodnoceni.mjs                 dávky z .cache/k2-2026 (záznam); chybějící dotáhne z ČSÚ
//   node scripts/k2-vyhodnoceni.mjs --dir .cache/k2-demo --out doc/vyhodnoceni-demo     zkouška na demu
//
// Výstup (výchozí doc/vyhodnoceni-2kolo-2026/): README.md (zpráva), obvody.csv, chyba.svg, obvody.svg.

import fs from 'node:fs';
import path from 'node:path';
import { createPredictor, parseBatch, verdict, MIN_SHARE } from '../src/predikce.js';
import { ROOT, args, loadK1, loadCandidates, batchFile, readTimes, readSavedBatches, fetchRemote, pairsFromRows } from './k2-common.mjs';

const opt = args();
const outArg = process.argv.indexOf('--out');
const OUT = path.resolve(outArg >= 0 ? process.argv[outArg + 1] : path.join(ROOT, 'doc', 'vyhodnoceni-2kolo-2026'));
const DEMO = opt.has('--demo');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(opt.dir, { recursive: true });

// ---- dávky: uložené ze záznamu, zbytek z ČSÚ ----
const batches = readSavedBatches(opt.dir);
if (!DEMO) {
  for (let n = batches.length + 1; ; n++) {
    const t = await fetchRemote(opt.base, n);
    if (!t) break;
    fs.writeFileSync(batchFile(opt.dir, n), t);
    batches.push(t);
  }
}
if (!batches.length) {
  console.error('Žádné dávky 2. kola (ani uložené, ani u ČSÚ).');
  process.exit(1);
}
const times = readTimes(opt.dir);
const k1 = loadK1();
const cands = loadCandidates();
const parsed = batches.map(parseBatch);
const finalRows = new Map();
for (const rows of parsed) for (const r of rows) finalRows.set(r.id, r);
const pairs = pairsFromRows([...finalRows.values()]);

// ---- přehrání dávek v pořadí, predikce po každé dávce pro obvody, kterých se týkala ----
let upto = 0;
const P = createPredictor({ k1, fetchBatch: async (n) => (n <= upto ? batches[n - 1] : null) });
const roles = new Map([...pairs].map(([o, [c1, c2]]) => [o, P.leaderOfFirstRound(o, c1, c2)])); // [A = vedoucí z 1. kola, B]
const hist = new Map([...pairs.keys()].map((o) => [o, []]));
const t0 = Date.now();
for (let n = 1; n <= batches.length; n++) {
  upto = n;
  await P.refresh();
  const touched = new Set(parsed[n - 1].map((r) => r.obvod));
  for (const o of touched) {
    if (!pairs.has(o)) continue;
    const [A, B] = roles.get(o);
    const r = P.predict(o, A, B);
    if (r) hist.get(o).push({ n, at: times[n] ?? null, countedPct: r.countedPct, counted: r.counted, total: r.total, publish: r.publish, share: r.share, lo: r.lo, hi: r.hi, pWin: r.pWin, naive: r.currentShare });
  }
}
console.log(`přehráno ${batches.length} dávek, ${pairs.size} obvodů, ${((Date.now() - t0) / 1000).toFixed(0)} s`);

// ---- skutečnost ----
const truth = new Map();
for (const [o, [A, B]] of roles) {
  let a = 0;
  let b = 0;
  for (const r of finalRows.values()) if (r.obvod === o) {
    a += r.votes[A] ?? 0;
    b += r.votes[B] ?? 0;
  }
  truth.set(o, { a, b, share: a / (a + b) });
}

const name = (o, c) => cands.get(o)?.cand.get(c)?.name ?? `č. ${c}`;
const party = (o, c) => cands.get(o)?.cand.get(c)?.party ?? '';
const oname = (o) => cands.get(o)?.name ?? `obvod ${o}`;
const pp = (x) => (x * 100).toFixed(1).replace('.', ',');
const pct = (x) => `${Math.round(x * 100)} %`;
const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague' }) : '–');

// ---- přesnost podle podílu sečtených okrsků ----
const LEVELS = [MIN_SHARE, 0.1, 0.25, 0.5, 0.75];
const at = (o, lv) => hist.get(o).find((h) => h.publish && h.countedPct >= lv);
const rows = [];
for (const lv of LEVELS) {
  let n = 0, seM = 0, seN = 0, aeM = 0, aeN = 0, hitM = 0, hitN = 0, cover = 0, sure = 0, sureWrong = 0;
  for (const [o, T] of truth) {
    const h = at(o, lv);
    if (!h) continue;
    n++;
    const eM = (h.share - T.share) * 100;
    const eN = (h.naive - T.share) * 100;
    seM += eM * eM; seN += eN * eN; aeM += Math.abs(eM); aeN += Math.abs(eN);
    hitM += (h.share > 0.5) === (T.share > 0.5) ? 1 : 0;
    hitN += (h.naive > 0.5) === (T.share > 0.5) ? 1 : 0;
    cover += T.share >= h.lo && T.share <= h.hi ? 1 : 0;
    const v = verdict(h, 'A', 'B');
    if (v?.sure) {
      sure++;
      if ((h.pWin > 0.5) !== (T.share > 0.5)) sureWrong++;
    }
  }
  if (n) rows.push({ lv, n, rmseM: Math.sqrt(seM / n), rmseN: Math.sqrt(seN / n), maeM: aeM / n, maeN: aeN / n, hitM, hitN, cover, sure, sureWrong });
}

// ---- předběžný odhad před hlasováním ----
let brier = 0, preHit = 0, upsets = [];
const pre = new Map();
for (const [o, [A, B]] of roles) {
  const fr = P.firstRound(o, A, B);
  const won = truth.get(o).share > 0.5;
  pre.set(o, fr);
  brier += (fr.prob - (won ? 1 : 0)) ** 2;
  if ((fr.prob > 0.5) === won) preHit++;
  if (!won) upsets.push(o);
}
brier /= truth.size;

// ---- kdy bylo jasno, změny favorita, největší omyly ----
const per = [...truth].map(([o, T]) => {
  const H = hist.get(o).filter((h) => h.publish);
  const firstSure = H.find((h) => verdict(h, 'A', 'B')?.sure);
  const wrongSure = H.filter((h) => verdict(h, 'A', 'B')?.sure && (h.pWin > 0.5) !== (T.share > 0.5));
  let flips = 0;
  for (let i = 1; i < H.length; i++) if ((H[i].pWin > 0.5) !== (H[i - 1].pWin > 0.5)) flips++;
  const misses = H.filter((h) => T.share < h.lo || T.share > h.hi);
  return { o, T, first: H[0], firstSure, wrongSure, flips, misses, lv: Object.fromEntries(LEVELS.map((lv) => [lv, at(o, lv)])) };
});

// ---- CSV ----
const csvHead = ['obvod', 'nazev', 'A_vedouci_1kolo', 'B', 'naskok_1kolo_pb', 'predbezna_sance_A', ...LEVELS.flatMap((lv) => [`p${lv * 100}_podil_A`, `p${lv * 100}_od`, `p${lv * 100}_do`, `p${lv * 100}_sance_A`, `p${lv * 100}_prosty_prepocet`]), 'konecny_podil_A', 'vitez', 'jiste_od_secteno', 'jiste_od_cas', 'zmen_favorita'];
const csv = [csvHead.join(';')];
for (const x of per) {
  const [A, B] = roles.get(x.o);
  const f = pre.get(x.o);
  csv.push([x.o, oname(x.o), name(x.o, A), name(x.o, B), f.lead.toFixed(1), f.prob.toFixed(3), ...LEVELS.flatMap((lv) => {
    const h = x.lv[lv];
    return h ? [h.share, h.lo, h.hi, h.pWin, h.naive].map((v) => v.toFixed(4)) : ['', '', '', '', ''];
  }), x.T.share.toFixed(4), name(x.o, x.T.share > 0.5 ? A : B), x.firstSure ? x.firstSure.countedPct.toFixed(3) : '', x.firstSure?.at ?? '', x.flips].join(';'));
}
fs.writeFileSync(path.join(OUT, 'obvody.csv'), '﻿' + csv.join('\n'));

// ---- grafy (SVG) ----
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
{
  const W = 760, H = 380, L = 60, B = 60, T = 50, max = Math.max(1, ...rows.flatMap((r) => [r.rmseM, r.rmseN])) * 1.15;
  const bw = (W - L - 20) / rows.length;
  const y = (v) => H - B - (v / max) * (H - B - T);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="Segoe UI, sans-serif"><rect width="${W}" height="${H}" fill="#fff"/>`;
  s += `<text x="${L}" y="28" font-size="18" font-weight="700" fill="#1f2540">Průměrná chyba odhadu konečného podílu (p. b.)</text>`;
  for (let g = 0; g <= max; g += max > 6 ? 2 : 1) s += `<line x1="${L}" x2="${W - 20}" y1="${y(g)}" y2="${y(g)}" stroke="#e5e7eb"/><text x="${L - 8}" y="${y(g) + 4}" font-size="12" text-anchor="end" fill="#6b7280">${g}</text>`;
  rows.forEach((r, i) => {
    const x = L + i * bw + bw * 0.15, w = bw * 0.33;
    s += `<rect x="${x}" y="${y(r.rmseN)}" width="${w}" height="${y(0) - y(r.rmseN)}" fill="#c4c9d6"/><text x="${x + w / 2}" y="${y(r.rmseN) - 5}" font-size="12" text-anchor="middle" fill="#4b5268">${pp(r.rmseN / 100)}</text>`;
    s += `<rect x="${x + w + 4}" y="${y(r.rmseM)}" width="${w}" height="${y(0) - y(r.rmseM)}" fill="#5c70d8"/><text x="${x + w * 1.5 + 4}" y="${y(r.rmseM) - 5}" font-size="12" font-weight="700" text-anchor="middle" fill="#3b3f8f">${pp(r.rmseM / 100)}</text>`;
    s += `<text x="${L + i * bw + bw / 2}" y="${H - B + 20}" font-size="13" text-anchor="middle" fill="#1f2540">${Math.round(r.lv * 100)} % sečteno</text>`;
  });
  s += `<rect x="${L}" y="${H - 22}" width="12" height="12" fill="#c4c9d6"/><text x="${L + 18}" y="${H - 12}" font-size="13" fill="#4b5268">prosté „dosavadní procento“</text><rect x="${L + 230}" y="${H - 22}" width="12" height="12" fill="#5c70d8"/><text x="${L + 248}" y="${H - 12}" font-size="13" fill="#4b5268">predikce (model)</text></svg>`;
  fs.writeFileSync(path.join(OUT, 'chyba.svg'), s);
}
{
  const lv = 0.1, list = per.filter((x) => x.lv[lv]).sort((a, b) => a.T.share - b.T.share);
  const W = 860, rowH = 26, T = 70, L = 230, R = 30, H = T + list.length * rowH + 50;
  const vals = list.flatMap((p) => [p.lv[lv].lo, p.lv[lv].hi, p.T.share]);
  const lo = Math.floor(Math.min(0.4, ...vals) * 10) / 10, hi = Math.ceil(Math.max(0.6, ...vals) * 10) / 10;
  const x = (v) => L + ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (W - L - R);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="Segoe UI, sans-serif"><rect width="${W}" height="${H}" fill="#fff"/>`;
  s += `<text x="20" y="30" font-size="18" font-weight="700" fill="#1f2540">Predikce při 10 % sečtených okrsků vs. konečný výsledek</text><text x="20" y="52" font-size="13" fill="#6b7280">podíl vedoucího z 1. kola; čára = 90% interval, kroužek = odhad, kosočtverec = skutečnost</text>`;
  for (let g = lo; g <= hi + 1e-9; g = Math.round((g + 0.1) * 10) / 10) s += `<line x1="${x(g)}" x2="${x(g)}" y1="${T - 8}" y2="${H - 40}" stroke="${Math.abs(g - 0.5) < 1e-9 ? '#9ca3af' : '#eef0f4'}" ${Math.abs(g - 0.5) < 1e-9 ? 'stroke-dasharray="4 3"' : ''}/><text x="${x(g)}" y="${H - 22}" font-size="12" text-anchor="middle" fill="#6b7280">${Math.round(g * 100)} %</text>`;
  list.forEach((p, i) => {
    const h = p.lv[lv], cy = T + i * rowH + 10, inside = p.T.share >= h.lo && p.T.share <= h.hi;
    const col = inside ? '#5c70d8' : '#e0315b';
    s += `<text x="${L - 10}" y="${cy + 4}" font-size="13" text-anchor="end" fill="#1f2540">${esc(oname(p.o))}</text>`;
    s += `<line x1="${x(h.lo)}" x2="${x(h.hi)}" y1="${cy}" y2="${cy}" stroke="${col}" stroke-width="4" stroke-linecap="round" opacity=".45"/><circle cx="${x(h.share)}" cy="${cy}" r="5" fill="#fff" stroke="${col}" stroke-width="2.5"/>`;
    s += `<rect x="${x(p.T.share) - 5}" y="${cy - 5}" width="10" height="10" transform="rotate(45 ${x(p.T.share)} ${cy})" fill="#1f2540"/>`;
  });
  s += `</svg>`;
  fs.writeFileSync(path.join(OUT, 'obvody.svg'), s);
}

// ---- zpráva ----
const md = [];
const r10 = rows.find((r) => r.lv === 0.1);
const allSure = per.filter((x) => x.firstSure);
const wrongSureTotal = per.reduce((s, x) => s + x.wrongSure.length, 0);
md.push(`# Vyhodnocení predikce 2. kola senátních voleb 2026${DEMO ? ' (DEMO – vymyšlená data)' : ''}`);
md.push('', `Vygenerováno ${new Date().toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' })} ze ${batches.length} dávek okrskových výsledků ČSÚ (${finalRows.size} okrsků, ${truth.size} obvodů). Predikce je přehraná stejným kódem jako na webu (\`src/predikce.js\`), ve skutečném pořadí sčítání. Postup modelu: [doc/PREDIKCE.md](../PREDIKCE.md).`);
md.push('', '## Shrnutí v číslech', '');
md.push(`* **Před hlasováním** (jen z náskoku v 1. kole): favorit vyhrál v **${preHit} z ${truth.size}** obvodů, Brierovo skóre ${brier.toFixed(3).replace('.', ',')} (zpětný test čekal 0,154). Vedoucí z 1. kola prohrál v ${upsets.length} obvodech${upsets.length ? `: ${upsets.map(oname).join(', ')}` : ''}.`);
for (const r of rows) md.push(`* **Při ${Math.round(r.lv * 100)} % sečtených okrsků** (${r.n} obvodů): průměrná chyba modelu **${pp(r.rmseM / 100)} p. b.** (RMSE), prosté přepočítání ${pp(r.rmseN / 100)} p. b.; vítěze model trefil v ${r.hitM}/${r.n}, prosté přepočítání v ${r.hitN}/${r.n}; 90% interval pokryl skutečnost v ${r.cover}/${r.n}; „jistých“ výroků ${r.sure}, z toho chybných **${r.sureWrong}**.`);
md.push(`* **Jistý výrok** (pravděpodobnost aspoň 95 % a sečteno aspoň 10 %) padl v ${allSure.length} z ${truth.size} obvodů; chybných jistých výroků za celý večer: **${wrongSureTotal}**.`);
md.push('', '![Chyba odhadu podle sečtených okrsků](chyba.svg)', '');
md.push('## Kde jsme se mýlili', '');
const big = per.filter((x) => x.lv[0.1]).map((x) => ({ x, e: (x.lv[0.1].share - x.T.share) * 100 })).sort((a, b) => Math.abs(b.e) - Math.abs(a.e)).slice(0, 5);
md.push('**Největší odchylky při 10 % sečteného:**', '');
for (const { x, e } of big) md.push(`* ${oname(x.o)} (${name(x.o, roles.get(x.o)[0])}): odhad ${pp(x.lv[0.1].share)} %, skutečnost ${pp(x.T.share)} % (${e > 0 ? '+' : ''}${pp(e / 100)} p. b.)${x.T.share < x.lv[0.1].lo || x.T.share > x.lv[0.1].hi ? ', **mimo 90% interval**' : ''}`);
const flipped = per.filter((x) => x.flips);
md.push('', flipped.length ? `**Změna favorita během sčítání:** ${flipped.map((x) => `${oname(x.o)} (${x.flips}×)`).join(', ')}.` : '**Favorit se během sčítání v žádném obvodu nezměnil.**');
const wrongSure = per.filter((x) => x.wrongSure.length);
md.push('', wrongSure.length ? `**Chybný jistý výrok:** ${wrongSure.map((x) => `${oname(x.o)} (poprvé při ${pct(x.wrongSure[0].countedPct)} sečteného)`).join(', ')}.` : '**Žádný jistý výrok nebyl chybný.**');
const outside = per.map((x) => ({ x, lvs: LEVELS.filter((lv) => x.lv[lv] && (x.T.share < x.lv[lv].lo || x.T.share > x.lv[lv].hi)) })).filter((y) => y.lvs.length);
const checks = rows.reduce((s2, r) => s2 + r.n, 0);
md.push('', `**Skutečnost mimo 90% interval** (sledováno při ${LEVELS.map((lv) => Math.round(lv * 100) + ' %').join(', ')}): ${outside.length ? outside.map((y) => `${oname(y.x.o)} (při ${y.lvs.map((lv) => Math.round(lv * 100) + ' %').join(', ')})`).join(', ') : 'nikde'}. Celkem ${outside.reduce((s2, y) => s2 + y.lvs.length, 0)} z ${checks} odhadů; u 90% intervalu se čeká zhruba 1 z 10.`);
const preWrong = per.filter((x) => (pre.get(x.o).prob > 0.5) !== (x.T.share > 0.5));
md.push('', `**Předběžný odhad se mýlil** v: ${preWrong.length ? preWrong.map((x) => `${oname(x.o)} (šance favorita ${pct(pre.get(x.o).prob)})`).join(', ') : 'žádném obvodu'}.`);
md.push('', '![Predikce při 10 % vs. skutečnost](obvody.svg)', '');
md.push('## Obvod po obvodu', '');
md.push('| obvod | vedoucí z 1. kola vs. soupeř | předem šance | 5 % | 10 % | 25 % | 50 % | konec | jisté od |', '|---|---|---|---|---|---|---|---|---|');
for (const x of [...per].sort((a, b) => a.o - b.o)) {
  const [A, B] = roles.get(x.o);
  const cell = (lv) => (x.lv[lv] ? `${pp(x.lv[lv].share)} (${pp(x.lv[lv].lo)}–${pp(x.lv[lv].hi)})` : '–');
  md.push(`| ${x.o} ${oname(x.o)} | ${name(x.o, A)} vs. ${name(x.o, B)} | ${pct(pre.get(x.o).prob)} | ${cell(0.05)} | ${cell(0.1)} | ${cell(0.25)} | ${cell(0.5)} | **${pp(x.T.share)}** | ${x.firstSure ? `${pct(x.firstSure.countedPct)}${x.firstSure.at ? `, ${clock(x.firstSure.at)}` : ''}` : '–'} |`);
}
md.push('', 'Čísla jsou podíl hlasů vedoucího z 1. kola (%) a v závorce 90% interval. „Jisté od“ = kdy poprvé padl výrok s pravděpodobností aspoň 95 % (při méně než 10 % sečteného se jistý výrok záměrně nevydává).');
if (Object.keys(times).length) {
  md.push('', '## Časová osa', '');
  for (const lv of [MIN_SHARE, 0.1, 0.25, 0.5, 1]) {
    const ts = per.map((x) => hist.get(x.o).find((h) => h.countedPct >= lv)?.at).filter(Boolean).sort();
    if (ts.length) md.push(`* ${Math.round(lv * 100)} % sečteno: první obvod ${clock(ts[0])}, poslední ${clock(ts[ts.length - 1])}`);
  }
}
md.push('', '## Co si z toho vzít do zpravodaje', '', '* Srovnání „model vs. prosté procento“ v grafu výše ukazuje, proč se nevyplatí věřit dosavadnímu procentu v prvních desítkách minut.', '* Sekce „Kde jsme se mýlili“ je vygenerovaná automaticky ze skutečných čísel; nic se nevynechává.', `* Podrobná data pro vlastní grafy: [obvody.csv](obvody.csv) (otevřete v Excelu).`);
fs.writeFileSync(path.join(OUT, 'README.md'), md.join('\n') + '\n');
console.log(`hotovo → ${OUT}`);
