import './style.css';
import { loadData, fullName } from './data.js';
import { RESULTS_URL, REFRESH_MS, MODES, DESC } from './config.js';
import { createMap } from './map.js';
import { obvodCard, inactiveCard, esc, chip, years } from './cards.js';
import { summarize, partyCounts, battleRows, ageHistogram, fmt1, fmtInt } from './stats.js';
import { ageChart, battleChart, GENDER_COLORS } from './charts.js';
import { renderGraphic, download } from './export.js';
import { senateChart, liveSeats } from './senate.js';
import { createTable } from './table.js';
import { createPoller, obvodResult } from './live.js';
import { demoXml } from './demo.js';
import { createPredictor, indexK1, K2_BASE, verdict, MIN_SHARE, MILESTONES } from './predikce.js';

const $ = (id) => document.getElementById(id);
const time = (d) => d.toLocaleTimeString('cs-CZ');
const demoLevel = Number(new URLSearchParams(location.search).get('demo')) || 0;

const data = await loadData();
const counts = partyCounts(data.candidates);
const battle = battleRows(data.obvody);

const state = {
  mode: 'incumbent',
  modeTouched: false,
  selected: null,
  partyFilter: null,
  results: null, // surová data z XML
  resMap: new Map(), // id obvodu -> odvozený výsledek
  anyVotes: false,
  senateView: 'before', // 'before' | 'live'
  senateTouched: false,
  status: { state: 'loading' },
};

// ---------- tooltip (vzhledem inspirovaný tooltipy v Power BI) ----------

const tip = $('tooltip');
let hoverId = null;

function placeTip(e) {
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  let x = e.clientX + 16;
  if (x + w > innerWidth - 8) x = Math.max(8, e.clientX - w - 16);
  let y = e.clientY + 16;
  if (y + h > innerHeight - 8) y = innerHeight - h - 8;
  tip.style.left = `${x}px`;
  tip.style.top = `${Math.max(8, y)}px`;
}

function hideTip() {
  tip.hidden = true;
  hoverId = null;
  map.setHover(null);
  document.querySelectorAll('.olist .is-hover').forEach((n) => n.classList.remove('is-hover'));
}

function onHover(id, e, inactive) {
  if (hoverId !== id) {
    hoverId = id;
    const feature = data.geo.features.find((f) => f.properties.id === id);
    tip.innerHTML = inactive
      ? inactiveCard(id, feature?.properties.name, data.othersById.get(id))
      : obvodCard(data.obvodById.get(id), { res: state.resMap.get(id) });
    tip.hidden = false;
    map.setHover(inactive ? null : id);
  }
  placeTip(e);
}
addEventListener('keydown', (e) => e.key === 'Escape' && hideTip());

// ---------- mapa ----------

const map = createMap($('map'), {
  data,
  onHover,
  onLeave: (id) => id === hoverId && hideTip(),
  onSelect: (id) => select(id, { zoom: false, scroll: true }),
});
$('z-in').onclick = () => map.zoomBy(1.6);
$('z-out').onclick = () => map.zoomBy(1 / 1.6);
$('z-reset').onclick = () => map.reset();
$('z-prague').onclick = () => map.zoomTo(map.pragueIds, { maxK: 20 });

// ---------- výběr obvodu ----------

function select(id, { zoom = true, scroll = false } = {}) {
  hideTip();
  state.selected = id;
  history.replaceState(null, '', id ? `#obvod-${id}` : location.pathname + location.search);
  renderMap();
  renderSide();
  if (id && zoom) map.zoomTo([id], { maxK: 9 });
  if (id && scroll && matchMedia('(max-width: 980px)').matches) $('side').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- vykreslování ----------

function renderSubtitle() {
  const at = (d, h = 14) => new Date(`2026-10-${d}T${h}:00:00+02:00`);
  const now = new Date();
  const days = (to) => Math.ceil((to - now) / 864e5);
  const plural = (n) => (n === 1 ? 'den' : n < 5 ? 'dny' : 'dní');
  let when;
  if (now < at(9)) when = `do 1. kola zbývá ${days(at(9))} ${plural(days(at(9)))}`;
  else if (now <= at(10)) when = '1. kolo právě probíhá';
  else if (now < at(16)) when = `1. kolo skončilo, 2. kolo 16.–17. 10. (zbývá ${days(at(16))} ${plural(days(at(16)))})`;
  else if (now <= at(17)) when = '2. kolo právě probíhá';
  else when = 'hlasování skončilo';
  $('subtitle').textContent = `Senát 2026: 1. kolo 9.–10. 10., 2. kolo 16.–17. 10. · ${data.obvody.length} z 81 obvodů · ${when}`;
}

const names = (g) => {
  const n = g.list.map((c) => fullName(c, { titles: false }));
  return n.length > 3 ? `${n.slice(0, 3).join(', ')} a další` : n.join(', ');
};

function renderKpis() {
  const s = summarize(data.candidates);
  const inc = data.obvody.filter((o) => o.incumbent);
  const notRunning = inc.filter((o) => !o.incumbent.running);
  const womenPct = Math.round((s.women / s.count) * 100);
  const tile = (l, v, sub, extra = '') => `<div class="kpi"><div class="kpi-l">${l}</div><div class="kpi-v">${v}</div>${extra}<div class="kpi-s">${sub}</div></div>`;

  let html =
    tile('Kandidátů', fmtInt(s.count), `v ${data.obvody.length} obvodech · ⌀ ${fmt1(s.count / data.obvody.length)} na obvod`) +
    tile(
      'Ženy / muži',
      `${s.women} <small>/</small> ${s.men}`,
      `ženy tvoří ${womenPct} % kandidátů`,
      `<div class="gbar" aria-hidden="true"><i style="width:${(s.women / s.count) * 100}%;background:${GENDER_COLORS.F}"></i><i style="width:${(s.men / s.count) * 100}%;background:${GENDER_COLORS.M}"></i></div>`,
    ) +
    tile('Průměrný věk', fmt1(s.meanAge), `medián ${fmt1(s.medianAge)} let`) +
    tile('Nejmladší', `${s.youngest.age} <small>let</small>`, esc(names(s.youngest))) +
    tile('Nejstarší', `${s.oldest.age} <small>let</small>`, esc(names(s.oldest))) +
    tile(
      'Obhajuje mandát',
      `${s.defending} <small>z ${inc.length}</small>`,
      notRunning.length ? `nekandiduje: ${esc(notRunning.map((o) => fullName(o.incumbent, { titles: false })).join(', '))}` : 'všichni úřadující senátoři kandidují',
    );

  if (state.anyVotes) {
    const all = [...state.resMap.values()];
    const c = (st) => all.filter((r) => r.state === st).length;
    html += tile(
      'Sčítání',
      `${c('elected')} <small>zvoleno</small>`,
      `${c('runoff')} obvodů míří do 2. kola · ${c('counting')} se sčítá · ${data.obvody.length - all.filter((r) => r.hasVotes).length} čeká`,
    );
  }
  $('kpis').innerHTML = html;
}

/** Panel „2. kolo“: co ČSÚ oficiálně potvrdil, a obvody se sečtenými okrsky, kde ČSÚ stav ještě nenastavil (jen předběžně). */
function renderRunoff() {
  const el = $('runoff-card');
  if (!state.anyVotes) {
    el.hidden = true;
    return;
  }
  const sec = (title, note, body) => `<div class="ro-sec"><h3>${title}</h3>${note ? `<p class="muted ro-note">${note}</p>` : ''}${body}</div>`;
  const cand = (x, pct) =>
    `<span class="ro-cand">${chip(x.c.party)} <b>${esc(fullName(x.c, { titles: false }))}</b>${
      x.c.defends ? ' <span class="badge badge--def">obhajuje</span>' : ''
    } <span class="muted">${fmt1(pct)} %</span></span>`;
  const item = (o, inner) => `<li><span class="ro-ob"><b>${o.id}</b> ${esc(o.name)}</span><span class="ro-pair">${inner}</span></li>`;
  const full = (r) => r.turnout?.precinctsTotal && r.turnout.precinctsDone >= r.turnout.precinctsTotal;

  const all = data.obvody.map((o) => ({ o, r: state.resMap.get(o.id) })).filter((x) => x.r?.hasVotes);
  const electedNow = all.filter(({ r }) => r.state === 'elected');
  const confirmed = all.filter(({ r }) => r.state === 'runoff');
  const prelim = all.filter(({ r }) => r.state === 'counting' && r.round === 1 && full(r));
  const counting = data.obvody.length - all.filter(({ r }) => r.state === 'elected' || r.state === 'runoff').length - prelim.length;

  let html = `<div class="card-head"><h2 id="runoff-h">Zvolení a postup do 2. kola (16.–17. 10.)</h2></div>`;
  if (electedNow.length) {
    html += sec(
      `Zvoleni, potvrzeno ČSÚ (${electedNow.length})`,
      '',
      `<ul class="ro-list">${electedNow
        .map(({ o, r }) => {
          const second = r.round === 2;
          return item(o, `${cand(r.elected, second ? r.elected.pct2 : r.elected.pct1)} <span class="badge badge--won">zvolen(a)</span>${second ? ' <span class="muted">ve 2. kole</span>' : ' <span class="muted">už v 1. kole</span>'}`);
        })
        .join('')}</ul>`,
    );
  }
  html += sec(
    `Potvrzeno ČSÚ (${confirmed.length})`,
    confirmed.length ? '' : 'ČSÚ zatím žádný postup do 2. kola nepotvrdil.',
    confirmed.length
      ? `<ul class="ro-list">${confirmed.map(({ o, r }) => item(o, r.advancing.map((x) => cand(x, x.pct1)).join('<span class="ro-vs">×</span>'))).join('')}</ul>`
      : '',
  );
  if (prelim.length) {
    const rowsHtml = prelim
      .map(({ o, r }) => {
        const [a, b] = r.rows;
        return a.pct1 > 50
          ? item(o, `${cand(a, a.pct1)} <span class="muted">má víc než polovinu hlasů → po potvrzení zvolen(a) už v 1. kole</span>`)
          : item(o, `${cand(a, a.pct1)}<span class="ro-vs">×</span>${cand(b, b.pct1)}`);
      })
      .join('');
    html += sec(
      `Sečteno 100 % okrsků, výsledek zatím ČSÚ nepotvrdil (${prelim.length})`,
      'Předběžný přepočet z hlasů: zvolen je, kdo získal víc než 50 % platných hlasů, jinak postupují dva nejlepší. Závazné je až vyhlášení ČSÚ.',
      `<ul class="ro-list ro-list--prelim">${rowsHtml}</ul>`,
    );
  }
  if (counting > 0) html += `<p class="muted ro-foot">Ještě se sčítá nebo čeká: ${counting} ${counting === 1 ? 'obvod' : counting < 5 ? 'obvody' : 'obvodů'}.</p>`;
  el.hidden = false;
  el.innerHTML = html;
}

// ---------- predikce 2. kola (src/predict.js, postup a zpětný test v doc/PREDIKCE.md) ----------

const kolo2Demo = Number(new URLSearchParams(location.search).get('kolo2')) || 0; // demo: za kolik minut se „sečte“ 2. kolo
const pred = { predictor: null, busy: false, error: null, saved: null };

// Trvalý záznam milníků (vzniká po sčítání skriptem scripts/predikce-milniky.mjs); dokud neexistuje, přehrává se průběh z dávek ČSÚ
fetch(`${import.meta.env.BASE_URL}data/predikce-milniky-2kolo.json`)
  .then((r) => (r.ok ? r.json() : null))
  .then((j) => (pred.saved = j))
  .catch(() => null);

/** Obvody, kde se (nebo se bude) hlasovat ve 2. kole: dvojice postupujících podle ČSÚ. */
function runoffPairs() {
  const out = [];
  for (const o of data.obvody) {
    const r = state.resMap.get(o.id);
    if (!r || (r.elected && r.round === 1)) continue;
    let pair = r.advancing.length >= 2 ? r.advancing : null;
    if (!pair && kolo2Demo && r.hasVotes) pair = r.rows.slice(0, 2);
    if (pair) out.push({ o, r, pair });
  }
  return out;
}

async function ensurePredictor() {
  if (pred.predictor) return pred.predictor;
  const k1 = await fetch(`${import.meta.env.BASE_URL}data/okrsky-k1.json`).then((r) => r.json());
  const k1Map = indexK1(k1);
  let fetchBatch;
  if (kolo2Demo) {
    const { createDemoK2 } = await import('./demo-k2.js');
    const pairs = new Map(runoffPairs().map(({ o, pair }) => [o.id, [pair[0].c.no, pair[1].c.no]]));
    fetchBatch = createDemoK2(k1Map, pairs, { minutes: kolo2Demo, seed: 11 }).fetchBatch;
  } else {
    fetchBatch = async (n) => {
      const r = await fetch(`${K2_BASE}vysledky_okrsky_${String(n).padStart(5, '0')}.xml`);
      return r.ok ? r.text() : null;
    };
  }
  pred.predictor = createPredictor({ k1: k1Map, fetchBatch });
  return pred.predictor;
}

async function updatePredictions() {
  if (pred.busy) return;
  const pairs = runoffPairs();
  if (!pairs.length) {
    $('predikce-card').hidden = true;
    return;
  }
  pred.busy = true;
  try {
    const p = await ensurePredictor();
    await p.refresh();
    pred.error = null;
  } catch (e) {
    pred.error = e instanceof Error ? e.message : String(e);
  } finally {
    pred.busy = false;
  }
  try {
    renderPredikce(runoffPairs());
  } catch (e) {
    console.error('Predikci se nepodařilo vykreslit', e);
  }
}

const pct0 = (x) => `${Math.round(x)} %`;

/** Vyhodnocení predikce přímo na webu: jak přesná byla při 5 / 10 / 25… % sečteného a kde jsme se mýlili (jen u už sečtených obvodů). */
function renderVyhodnoceni(items) {
  const el = $('vyhodnoceni-card');
  const p = pred.predictor;
  const done = items
    .filter((i) => i.res && i.res.countedPct >= 0.999 && !i.official)
    .map((i) => ({ ...i, final: i.res.currentShare, ms: p.milestones(i.o.id, i.xa.c.no, i.xb.c.no) }));
  const pre = items.filter((i) => i.res?.countedPct >= 0.999);
  if (!done.length && !pre.length) {
    el.hidden = true;
    return;
  }
  const pp = (x) => `${fmt1(Math.abs(x) * 100)}`;
  const sgn = (x) => (x >= 0 ? '+' : '−');
  const rowsT = MILESTONES.map((t) => {
    const pts = done.map((d) => ({ d, x: d.ms.find((m) => m.prah === t) })).filter((q) => q.x);
    if (!pts.length) return null;
    const n = pts.length;
    const mae = pts.reduce((s, q) => s + Math.abs(q.x.share - q.d.final), 0) / n;
    const maeNaive = pts.reduce((s, q) => s + Math.abs(q.x.current - q.d.final), 0) / n;
    const cover = pts.filter((q) => q.d.final >= q.x.lo && q.d.final <= q.x.hi).length;
    const right = pts.filter((q) => (q.x.pWin > 0.5) === (q.d.final > 0.5)).length;
    const sure = pts.filter((q) => (q.x.pWin >= 0.95 || q.x.pWin <= 0.05) && q.x.countedPct >= 0.1);
    const sureWrong = sure.filter((q) => (q.x.pWin > 0.5) !== (q.d.final > 0.5)).length;
    return `<tr><td>${pct0(t * 100)}</td><td>${n}</td><td><b>${pp(mae)} p. b.</b></td><td>${pp(maeNaive)} p. b.</td><td>${cover} z ${n}</td><td>${right} z ${n}</td><td>${sureWrong} z ${sure.length}</td></tr>`;
  }).filter(Boolean);

  // kde jsme se mýlili
  const misses = [];
  for (const d of done) {
    const name = `${d.o.id} ${d.o.name}`;
    for (const t of [0.1, 0.25]) {
      const x = d.ms.find((m) => m.prah === t);
      if (!x) continue;
      const err = x.share - d.final;
      const flip = (x.pWin > 0.5) !== (d.final > 0.5);
      if (flip) misses.push({ w: 1000 + Math.abs(err), txt: `<b>${esc(name)}</b>: při ${pct0(t * 100)} sečteného jsme čekali výhru ${esc((x.pWin > 0.5 ? d.xa : d.xb).c.lastName)} (${pct0(Math.max(x.pWin, 1 - x.pWin) * 100)}), ale vyhrál ${esc((d.final > 0.5 ? d.xa : d.xb).c.lastName)}.` });
      else if (Math.abs(err) >= 0.03) misses.push({ w: Math.abs(err), txt: `<b>${esc(name)}</b>: při ${pct0(t * 100)} sečteného jsme odhadovali ${esc(d.xa.c.lastName)} na ${fmt1(x.share * 100)} %, vyšlo ${fmt1(d.final * 100)} % (chyba ${sgn(err)}${pp(err)} p. b.).` });
      else if (d.final < x.lo || d.final > x.hi) misses.push({ w: 0.01 + Math.abs(err) / 10, txt: `<b>${esc(name)}</b>: při ${pct0(t * 100)} sečteného vyšlo ${fmt1(d.final * 100)} % mimo náš 90% interval (${fmt1(x.lo * 100)}–${fmt1(x.hi * 100)} %).` });
    }
  }
  misses.sort((a, b) => b.w - a.w);

  // předběžný odhad před hlasováním vs. výsledek
  const preRows = pre.map((i) => ({ i, win: i.res.currentShare > 0.5, p: i.fr.prob }));
  let preHtml = '';
  if (preRows.length) {
    const exp = preRows.reduce((s, r) => s + r.p, 0);
    const got = preRows.filter((r) => r.win).length;
    const brier = preRows.reduce((s, r) => s + (r.p - (r.win ? 1 : 0)) ** 2, 0) / preRows.length;
    const upsets = preRows.filter((r) => !r.win);
    preHtml = `<h3 class="vy-h">Předběžný odhad před hlasováním</h3>
      <p class="muted ro-note">V ${preRows.length} sečtených obvodech vyhrál vedoucí z 1. kola v ${got} (čekali jsme ${fmt1(exp)}). Brierovo skóre ${brier.toFixed(3)} (0 je dokonalé, 0,25 je hod mincí; zpětný test na minulých volbách čekal 0,154).${
        upsets.length ? ` Překvapení: ${upsets.map((r) => `${esc(r.i.o.name)} (vyhrál ${esc(r.i.xb.c.lastName)}, šance vedoucího byla ${pct0(r.p * 100)})`).join(', ')}.` : ' Žádné překvapení, vedoucí z 1. kola vyhrál všude.'
      }</p>`;
  }

  el.hidden = false;
  el.innerHTML = `<div class="card-head"><h2 id="vyhodnoceni-h">Jak přesná predikce byla (vyhodnocuje se průběžně)</h2></div>
    <p class="muted ro-note">Porovnání toho, co predikce tvrdila při překonání prahu sečtených okrsků v obvodu, s konečným výsledkem. Počítá se samo z obvodů, které už jsou sečtené zcela (${done.length} z ${items.length}). Prosté „dosavadní procento“ je to, co ukazují jiné weby: podíl z už sečtených hlasů.</p>
    ${rowsT.length ? `<div class="ms-wrap"><table class="pr-ms vy-t"><thead><tr><th>Sečteno</th><th>Obvodů</th><th>Naše průměrná chyba</th><th>Prosté procento</th><th>V 90% intervalu</th><th>Vítěz správně</th><th>Jisté výroky chybně</th></tr></thead><tbody>${rowsT.join('')}</tbody></table></div>` : '<p class="muted">Zatím není žádný obvod sečtený celý.</p>'}
    <h3 class="vy-h">Kde jsme se mýlili</h3>
    ${misses.length ? `<ul class="vy-list">${misses.slice(0, 8).map((m) => `<li>${m.txt}</li>`).join('')}</ul>` : '<p class="muted">Zatím nic zásadního: žádný změněný favorit ani velká odchylka u dosud sečtených obvodů.</p>'}
    ${preHtml}`;
}

/** Tabulka „co jsme říkali při 5 / 10 / 25 … % sečteného a jaká byla tehdy skutečnost“; zůstává na webu i po sečtení. */
function milestonesHtml(obvodId, xa, xb, res) {
  const saved = pred.saved?.obvody?.[obvodId];
  const usable = saved && saved.konec && saved.A === xa.c.no && saved.B === xb.c.no; // uložený záznam jen u hotových obvodů, jinak živě
  const ms = usable ? saved.milniky : pred.predictor.milestones(obvodId, xa.c.no, xb.c.no);
  if (!ms.length) return '';
  const done = usable ? saved.konec : res.countedPct >= 0.999 ? { share: res.currentShare } : null;
  const hm = (t) => (t ? new Date(t).toLocaleString('cs-CZ', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '');
  const rows = ms
    .map((x) => {
      const err = done ? x.share - done.share : null;
      return `<tr><td>${pct0(x.prah * 100)} okrsků <span class="muted">(${x.counted} z ${x.total}${x.cas ? `, ${hm(x.cas)}` : ''})</span></td>
        <td><b>${fmt1(x.share * 100)} %</b> <span class="muted">(${fmt1(x.lo * 100)}–${fmt1(x.hi * 100)})</span></td>
        <td>${fmt1(x.current * 100)} %</td>
        <td>${err == null ? '' : `${err >= 0 ? '+' : '−'}${fmt1(Math.abs(err) * 100)} p. b.`}</td></tr>`;
    })
    .join('');
  const end = done ? `<tr class="pr-ms-end"><td>Všechny okrsky sečteny</td><td></td><td><b>${fmt1(done.share * 100)} %</b></td><td class="muted">konečný výsledek</td></tr>` : '';
  return `<table class="pr-ms"><caption>Jak se predikce vyvíjela: ${esc(xa.c.lastName)}</caption>
    <thead><tr><th>Překonán práh</th><th>Naše predikce (90 % interval)</th><th>Skutečný stav tehdy</th><th>Chyba proti konci</th></tr></thead><tbody>${rows}${end}</tbody></table>`;
}

function renderPredikce(pairs) {
  renderPredikceInner(pairs);
  $('predikce-card').after($('vyhodnoceni-card'));
}

function renderPredikceInner(pairs) {
  const el = $('predikce-card');
  const p = pred.predictor;
  if (!pairs.length || !p) {
    el.hidden = true;
    return;
  }
  const items = pairs.map(({ o, r, pair }) => {
    const [na, nb] = p.leaderOfFirstRound(o.id, pair[0].c.no, pair[1].c.no);
    const xa = pair.find((x) => x.c.no === na);
    const xb = pair.find((x) => x.c.no === nb);
    const res = p.predict(o.id, na, nb);
    const fr = p.firstRound(o.id, pair[0].c.no, pair[1].c.no);
    const official = r.state === 'elected' && r.round === 2 ? r.elected : null;
    return { o, xa, xb, res, official, fr };
  });
  const closeness = (i) => (i.official ? 9 : i.res?.publish ? Math.abs(i.res.pWin - 0.5) : Math.abs(i.fr.prob - 0.5) + 1);
  items.sort((a, b) => closeness(a) - closeness(b));
  const started = items.some((i) => i.res);
  const published = items.filter((i) => i.res?.publish);

  // souhrn: kdo je favoritem v kolika obvodech (jistě = pravděpodobnost aspoň 95 %)
  const fav = new Map();
  for (const i of published) {
    const first = i.res.pWin >= 0.5;
    const x = first ? i.xa : i.xb;
    const prob = first ? i.res.pWin : 1 - i.res.pWin;
    const e = fav.get(x.c.party.key) ?? { party: x.c.party, n: 0, sure: 0 };
    e.n++;
    if (prob >= 0.95 && i.res.countedPct >= 0.1) e.sure++;
    fav.set(x.c.party.key, e);
  }
  const summary = [...fav.values()]
    .sort((a, b) => b.n - a.n)
    .map((e) => `<span class="pr-fav">${chip(e.party)} <b>${e.n}</b>${e.sure < e.n ? ` <span class="muted">(z toho ${e.sure} jistě)</span>` : ''}</span>`)
    .join('');

  const row = ({ o, xa, xb, res, official }) => {
    const nm = (x) => `${chip(x.c.party)} <b>${esc(fullName(x.c, { titles: false }))}</b>${x.c.defends ? ' <span class="badge badge--def">obhajuje</span>' : ''}`;
    const head = `<div class="pr-head"><div class="pr-ob"><b>${o.id}</b> ${esc(o.name)}</div><div class="pr-vs">${nm(xa)}<span class="ro-vs">×</span>${nm(xb)}</div></div>`;
    let body;
    if (official) {
      body = `<span class="badge badge--won">zvolen(a)</span> ${esc(fullName(official.c, { titles: false }))} <span class="muted">potvrzeno ČSÚ</span>`;
    } else if (!res) {
      body = '<span class="muted">2. kolo zatím nezačalo, nebo ještě není sečten žádný okrsek</span>';
    } else if (!res.publish) {
      body = `<span class="muted">Sečteno ${res.counted} z ${res.total} okrsků (${pct0(res.countedPct * 100)}). Predikce se vydá od ${pct0(MIN_SHARE * 100)} sečtených okrsků.</span>`;
    } else {
      const v = verdict(res, fullName(xa.c, { titles: false }), fullName(xb.c, { titles: false }));
      const lo = res.lo * 100;
      const hi = res.hi * 100;
      const w = 100 - lo - (100 - hi);
      body = `<div class="pr-bar" role="img" aria-label="Odhad podílu ${esc(xa.c.lastName)}: ${fmt1(res.share * 100)} % (90 % interval ${fmt1(lo)} až ${fmt1(hi)} %)">
          <i class="pr-band" style="left:${lo}%;width:${w}%;background:${xa.c.party.color}"></i><i class="pr-mid"></i><i class="pr-mark" style="left:${res.share * 100}%;background:${xa.c.party.color}"></i></div>
        <div class="pr-nums"><span><b>${esc(xa.c.lastName)}</b> ${fmt1(res.share * 100)} % · <b>${esc(xb.c.lastName)}</b> ${fmt1(100 - res.share * 100)} %</span>
        <span class="muted">90 % interval ${fmt1(lo)}–${fmt1(hi)} % · sečteno ${pct0(res.countedPct * 100)} okrsků, zatím ${fmt1(res.currentShare * 100)} % pro ${esc(xa.c.lastName)}</span></div>
        ${res.countedPct >= 0.999
          ? `<div class="pr-verdict pr-verdict--sure"><b>${esc(res.share >= 0.5 ? fullName(xa.c, { titles: false }) : fullName(xb.c, { titles: false }))}</b> vede po sečtení všech okrsků, čeká se na potvrzení ČSÚ</div>`
          : `<div class="pr-verdict pr-verdict--${v.sure ? 'sure' : v.prob >= 0.8 ? 'likely' : 'open'}"><b>${esc(v.winner)}</b>: ${pct0(Math.min(99, v.prob * 100))} šance na zvolení, ${v.level}</div>`}`;
    }
    if (res?.publish && !official) body += milestonesHtml(o.id, xa, xb, res);
    return `<li class="pr-item">${head}<div class="pr-body">${body}</div></li>`;
  };

  // Než 2. kolo začne, je nahoře skutečná situace (zvolení a postup) a predikce jen kompaktně pod ní; při sčítání 2. kola predikce nahoru.
  const runoffEl = $('runoff-card');
  if (started && runoffEl.previousElementSibling !== el) runoffEl.before(el);
  else if (!started && runoffEl.nextElementSibling !== el) runoffEl.after(el);
  if (!started) {
    const rowsHtml = items
      .map(({ o, xa, xb, fr }) => {
        const pa = fr.prob;
        const lead = pa >= 0.5 ? xa : xb;
        const pl = pa >= 0.5 ? pa : 1 - pa;
        const nm = (x) => `${chip(x.c.party)} <b>${esc(fullName(x.c, { titles: false }))}</b>${x.c.defends ? ' <span class="badge badge--def">obhajuje</span>' : ''}`;
        return `<li class="pr-item"><div class="pr-head"><div class="pr-ob"><b>${o.id}</b> ${esc(o.name)}</div><div class="pr-vs">${nm(xa)}<span class="ro-vs">×</span>${nm(xb)}</div></div>
          <div class="pr-body"><div class="pr-bar" role="img" aria-label="Předběžná šance: ${esc(xa.c.lastName)} ${pct0(pa * 100)}"><i class="pr-fill" style="width:${pa * 100}%;background:${xa.c.party.color}"></i><i class="pr-mid"></i></div>
          <div class="pr-nums"><span><b>${esc(xa.c.lastName)}</b> ${fmt1(fr.aPct)} % × <b>${esc(xb.c.lastName)}</b> ${fmt1(fr.bPct)} % v 1. kole</span><span class="muted">náskok ${fmt1(fr.lead)} p. b.</span></div>
          <div class="pr-verdict pr-verdict--${pl >= 0.8 ? 'likely' : 'open'}"><b>${esc(fullName(lead.c, { titles: false }))}</b>: předběžně ${pct0(Math.min(99, pl * 100))} šance na zvolení</div></div></li>`;
      })
      .join('');
    // očekávaný počet obvodů podle stran = součet pravděpodobností výhry
    const exp = new Map();
    for (const { xa, xb, fr } of items) {
      for (const [x, pr] of [[xa, fr.prob], [xb, 1 - fr.prob]]) {
        const e = exp.get(x.c.party.key) ?? { party: x.c.party, v: 0 };
        e.v += pr;
        exp.set(x.c.party.key, e);
      }
    }
    const expHtml = [...exp.values()]
      .sort((u, v) => v.v - u.v)
      .map((e) => `<span class="pr-fav">${chip(e.party)} <b>${fmt1(e.v)}</b></span>`)
      .join('');
    el.hidden = false;
    el.innerHTML = `<div class="card-head"><h2 id="predikce-h">Předběžný odhad 2. kola (před hlasováním)</h2></div>
      <p class="muted ro-note">Sčítání 2. kola ještě nezačalo. Odhad vychází jen z výsledku 1. kola a ze zkušenosti z minulých druhých kol (2018–2024, zpětně otestováno): vedoucí z 1. kola vyhrál zhruba ve třech ze čtyř obvodů a čím větší náskok, tím jistěji. Je to hrubý odhad, od ${pct0(MIN_SHARE * 100)} sečtených okrsků ho nahradí průběžná predikce z výsledků 2. kola.</p>
      <div class="pr-summary"><span class="muted">Očekávaný počet obvodů (součet pravděpodobností) z ${items.length}:</span> ${expHtml}</div>
      <ul class="pr-list">${rowsHtml}</ul>`;
    renderVyhodnoceni(items);
    return;
  }

  let html = `<div class="card-head"><h2 id="predikce-h">Predikce 2. kola (statistický odhad)</h2></div>`;
  html += started
    ? `<p class="muted ro-note">Odhad konečného výsledku z už sečtených okrsků: model navíc zná výsledky 1. kola v okrscích, které se teprve sečtou, a tím opravuje zkreslení (nejdřív se sčítají malé obce). Zpětně otestováno na 97 druhých kolech z let 2018–2024. Není to oficiální výsledek, závazné je vyhlášení ČSÚ.</p>`
    : `<p class="muted ro-note">Predikce se spustí během sčítání 2. kola (16.–17. 10.), jakmile bude v obvodu sečteno ${pct0(MIN_SHARE * 100)} okrsků. Postupující zatím: ${items.length} obvodů.</p>`;
  if (published.length) html += `<div class="pr-summary"><span class="muted">Favoriti v ${published.length} z ${items.length} obvodů:</span> ${summary}</div>`;
  html += `<ul class="pr-list">${items.map(row).join('')}</ul>`;
  if (pred.error) html += `<p class="muted ro-foot">Dávky okrskových výsledků se nepodařilo načíst (${esc(pred.error)}), zobrazuji poslední známý stav.</p>`;
  el.hidden = false;
  el.innerHTML = html;
  renderVyhodnoceni(items);
}

function renderStatus() {
  const s = state.status;
  const el = $('status');
  let cls = 'loading';
  let text = 'Načítám výsledky z ČSÚ…';
  if (demoLevel) {
    cls = 'ok';
    text = 'DEMO – fiktivní výsledky, ne skutečná data';
  } else if (s.state === 'ok') {
    cls = 'ok';
    text = s.anyVotes
      ? `Živé výsledky ČSÚ · data z ${s.generatedAt ? time(s.generatedAt) : '?'}`
      : `Výsledky zatím nejsou (sčítání nezačalo) · zkontrolováno ${time(s.at)}`;
  } else if (s.state === 'error') {
    cls = 'error';
    text = `Výsledky z ČSÚ se nepodařilo načíst (${esc(s.error)})`;
  }
  el.className = `status ${cls}`;
  el.innerHTML = `<span class="led"></span><span>${text}</span><span class="muted" id="next"></span><button type="button" id="refresh">Obnovit</button>`;
  $('refresh').onclick = () => poller.refresh();
  tickNext();
}

function tickNext() {
  const n = $('next');
  if (!n) return;
  const at = state.status.nextAt;
  n.textContent = at && !document.hidden ? `· další kontrola za ${Math.max(0, Math.round((at - Date.now()) / 1000))} s` : '';
}
setInterval(tickNext, 1000);

function renderModes() {
  const modes = MODES.filter((m) => m.id !== 'leader' || state.anyVotes);
  if (!modes.some((m) => m.id === state.mode)) state.mode = 'incumbent';
  $('modes').innerHTML = modes.map((m) => `<button type="button" data-m="${m.id}" class="${m.id === state.mode ? 'is-on' : ''}">${m.label}</button>`).join('');
}
$('modes').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  state.mode = b.dataset.m;
  state.modeTouched = true;
  renderModes();
  renderMap();
  renderLegend();
});

function renderMap() {
  map.update({ mode: state.mode, results: state.resMap, partyFilter: state.partyFilter, selected: state.selected });
}

function renderLegend() {
  const lg = $('legend');
  const desc = `<div class="lg-desc muted" style="flex-basis:100%">${DESC[state.mode]}</div>`;
  if (state.mode === 'count' || state.mode === 'age') {
    const vals = data.obvody.map((o) => (state.mode === 'count' ? o.candidates.length : o.candidates.reduce((s, c) => s + c.age, 0) / o.candidates.length));
    const [a, b] = state.mode === 'count' ? ['#dbe9f6', '#1d5fa8'] : ['#e3f1ee', '#0f6b62'];
    const f = state.mode === 'count' ? String : fmt1;
    lg.innerHTML = `${desc}<span class="ramp">${f(Math.min(...vals))}<i style="background:linear-gradient(90deg,${a},${b})"></i>${f(Math.max(...vals))}</span>`;
    return;
  }
  lg.innerHTML =
    desc +
    counts
      .map(
        (c) => `<button type="button" class="lg${state.partyFilter === c.key ? ' is-active' : ''}${state.partyFilter && state.partyFilter !== c.key ? ' is-dim' : ''}" data-key="${c.key}" title="Zvýraznit kandidáty: ${esc(c.short)}">
          <i style="background:${c.color}"></i><span>${esc(c.short)}</span> <b>${c.count}</b></button>`,
      )
      .join('') +
    '<span class="lg-note"><i></i>tlustý kroužek = obhajuje mandát</span>';
}
$('legend').addEventListener('click', (e) => {
  const b = e.target.closest('.lg');
  if (b) setPartyFilter(b.dataset.key);
});

function setPartyFilter(key) {
  state.partyFilter = state.partyFilter === key ? null : key;
  $('clear-party').hidden = !state.partyFilter;
  renderLegend();
  renderParties();
  renderMap();
  table.update(tableState());
}
$('clear-party').onclick = () => setPartyFilter(state.partyFilter);

function renderParties() {
  battleChart($('battle'), battle, { active: state.partyFilter, onPick: setPartyFilter });
}

function renderSide() {
  const side = $('side');
  if (state.selected) {
    const o = data.obvodById.get(state.selected);
    side.innerHTML = `<button type="button" class="link side-back" id="side-back">← Všechny obvody</button>${obvodCard(o, { res: state.resMap.get(o.id), full: true })}`;
    $('side-back').onclick = () => select(null);
    side.scrollTop = 0;
    return;
  }
  side.innerHTML = `<div class="card-head"><h2>Obvody, ve kterých se volí</h2></div>
    <ul class="olist">${data.obvody
      .map((o) => {
        const res = state.resMap.get(o.id);
        const inc = o.incumbent;
        const lead = res?.elected ?? res?.leader;
        // po 1. kole jen ti, kdo jsou ve hře: u zvoleného vítěz, u postupujících ti dva
        const inPlay = res?.elected ? [res.elected.c] : res?.advancing?.length >= 2 ? res.advancing.map((x) => x.c) : o.candidates;
        const sub = res?.advancing?.length >= 2 && !res.elected
          ? `do 2. kola: ${esc(res.advancing.map((x) => x.c.lastName).join(' × '))}`
          : lead
          ? `${res.elected ? 'zvolen(a)' : 'vede'}: ${esc(fullName(lead.c, { titles: false }))}`
          : inc
            ? `senátor: ${esc(fullName(inc, { titles: false }))}${inc.running ? '' : ' (nekandiduje)'}`
            : `${o.candidates.length} kandidátů`;
        return `<li><button type="button" data-id="${o.id}"><span class="no">${o.id}</span>
          <span class="nm">${esc(o.name)}<small>${sub}</small></span>
          <span class="dots" aria-hidden="true">${inPlay.map((c) => `<i class="${c.defends ? 'd' : ''}" style="background:${c.party.color}"></i>`).join('')}</span></button></li>`;
      })
      .join('')}</ul>`;
}
$('side').addEventListener('click', (e) => {
  const b = e.target.closest('.olist button');
  if (b) select(Number(b.dataset.id));
});
$('side').addEventListener('pointerover', (e) => {
  const b = e.target.closest('.olist button');
  if (b && e.pointerType !== 'touch') map.setHover(Number(b.dataset.id));
});
$('side').addEventListener('pointerleave', () => map.setHover(null));

// ---------- grafy, tabulka, patička ----------

ageChart($('age-chart'), ageHistogram(data.candidates));
renderParties();

const table = createTable($('table'), {
  data,
  onPick: (id) => {
    select(id);
    $('map').scrollIntoView({ behavior: 'smooth', block: 'center' });
  },
});
const tableState = () => ({ results: state.resMap, partyFilter: state.partyFilter });

function renderFooter() {
  const m = data.meta;
  $('foot').innerHTML = `
    <div>Zdroj dat: <a href="https://volby.gov.cz/opendata/se2026/se2026_opendata.htm">otevřená data ČSÚ – volby do Senátu 2026</a> (registr kandidátů, hranice obvodů z <a href="https://csu.gov.cz/rso/volebni_obvody_senat">ČSÚ</a>).
      Výsledky se stahují přímo z <a href="${RESULTS_URL}">volby.gov.cz</a> a obnovují se každou minutu.</div>
    <div>Registr kandidátů: <code>${esc(m.sources.registry.split('/').pop())}</code>, sestaveno ${new Date(m.generatedAt).toLocaleString('cs-CZ')}.
      Obhájci mandátu určeni podle složení Senátu ze dne ${new Date(m.sources.incumbentsAsOf).toLocaleDateString('cs-CZ')} – při pozdější změně může být údaj neaktuální.</div>
    <div>Pohlaví není součástí dat ČSÚ, je odvozeno z jména a příjmení. Barva = nominující strana; kandidát nominovaný stranou může být bezpartijní.
      Neoficiální přehled, závazné jsou výsledky na <a href="https://volby.gov.cz">volby.gov.cz</a>.</div>
    <div><a href="vysilani.html">Vysílací režim</a> (obrazovka pro stream s automatickým komentářem) · zkouška: <a href="vysilani.html?demo=noc">celý večer za 10 minut, fiktivní data</a></div>`;
}

// ---------- výsledky (živě z ČSÚ) ----------

function recompute() {
  state.resMap = new Map();
  for (const o of data.obvody) {
    const r = obvodResult(o, state.results);
    if (r) state.resMap.set(o.id, r);
  }
  state.anyVotes = [...state.resMap.values()].some((r) => r.hasVotes);
  // jakmile přijdou první hlasy, přepnout mapu na vedoucí kandidáty (pokud uživatel nevolil jinak)
  if (state.anyVotes && !state.modeTouched) state.mode = 'leader';
}

function renderSenate() {
  const live = liveSeats(data.senate, state.resMap);
  const decided = [...live.values()].filter((v) => v.won).length;
  if (!decided) state.senateView = 'before';
  else if (!state.senateTouched) state.senateView = 'live';
  const views = $('senate-views');
  views.hidden = !decided;
  views.innerHTML = [['before', 'Před volbami'], ['live', 'Průběžné složení']]
    .map(([id, label]) => `<button type="button" data-v="${id}" class="${id === state.senateView ? 'is-on' : ''}">${label}</button>`)
    .join('');
  senateChart($('senate'), data.senate, { live: state.senateView === 'live' ? live : null });
  const asOf = new Date(data.senate.asOf).toLocaleDateString('cs-CZ');
  $('senate-note').innerHTML =
    state.senateView === 'live'
      ? `Rozhodnuto ${decided} z ${live.size} volených křesel. Zvolení jsou zařazeni do klubu podle strany, po volbách se kluby ještě mění. Původní složení: <a href="${data.senate.source}">senat.cz</a> k ${asOf}.`
      : `Složení klubů podle <a href="${data.senate.source}">senat.cz</a> k ${asOf}. Křeslo se zatržítkem: mandát, o který se letos volí (${live.size} z ${data.senate.seats.length}).`;
}
$('senate-views').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  state.senateView = b.dataset.v;
  state.senateTouched = true;
  renderSenate();
});

function renderAll() {
  renderSubtitle();
  renderStatus();
  renderKpis();
  renderRunoff();
  renderModes();
  renderMap();
  renderLegend();
  renderSide();
  renderSenate();
  table.update(tableState());
  updatePredictions();
}

const fetchText = demoLevel
  ? async () => demoXml(data.obvody, demoLevel)
  : async () => {
      const r = await fetch(RESULTS_URL, { cache: 'no-cache' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    };

const poller = createPoller({
  fetchText,
  interval: REFRESH_MS,
  onData(results) {
    state.results = results;
    recompute();
    renderAll();
    if (state.selected) renderSide();
  },
  onStatus(patch) {
    Object.assign(state.status, patch);
    renderStatus();
  },
});

if (demoLevel) {
  $('demo-banner').hidden = false;
  const what = { 1: 'první výsledky (sečteno 5–40 % okrsků)', 2: 'konec 1. kola', 3: 'po 2. kole' }[demoLevel] ?? '';
  $('demo-banner').textContent = `DEMO REŽIM${what ? ` – ${what}` : ''} – zobrazená čísla jsou vygenerovaná, nejde o skutečné výsledky voleb.`;
}

// ---------- export grafik do PNG ----------

document.querySelectorAll('[data-export]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Připravuji…';
    try {
      const { blob, file } = await renderGraphic(btn.dataset.export, { data, counts, battle, state, map, demo: !!demoLevel });
      download(blob, file);
    } catch (e) {
      alert(`Obrázek se nepodařilo vytvořit: ${e instanceof Error ? e.message : e}`);
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });
});

renderFooter();
const initial = Number(location.hash.match(/obvod-(\d+)/)?.[1]);
if (data.obvodById.has(initial)) state.selected = initial;
renderAll();
if (state.selected) setTimeout(() => map.zoomTo([state.selected], { maxK: 9 }), 100);
poller.start();
