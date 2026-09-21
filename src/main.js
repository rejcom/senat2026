import './style.css';
import { loadData, fullName } from './data.js';
import { RESULTS_URL, REFRESH_MS, MODES, DESC } from './config.js';
import { createMap } from './map.js';
import { obvodCard, inactiveCard, esc, chip, years } from './cards.js';
import { summarize, partyCounts, battleRows, ageHistogram, fmt1, fmtInt } from './stats.js';
import { ageChart, battleChart, GENDER_COLORS } from './charts.js';
import { renderGraphic, download } from './export.js';
import { createTable } from './table.js';
import { createPoller, obvodResult } from './live.js';
import { demoXml } from './demo.js';

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
  const start = new Date('2026-10-09T14:00:00+02:00');
  const end = new Date('2026-10-10T14:00:00+02:00');
  const now = new Date();
  let when = '';
  if (now < start) {
    const d = Math.ceil((start - now) / 864e5);
    when = ` · do voleb zbývá ${d} ${d === 1 ? 'den' : d < 5 ? 'dny' : 'dní'}`;
  } else if (now <= end) when = ' · volby právě probíhají';
  $('subtitle').textContent = `1. kolo 9.–10. 10. 2026, případné 2. kolo 16.–17. 10. 2026 · ${data.obvody.length} z 81 obvodů${when}`;
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
        const sub = lead
          ? `${res.elected ? 'zvolen(a)' : 'vede'}: ${esc(fullName(lead.c, { titles: false }))}`
          : inc
            ? `senátor: ${esc(fullName(inc, { titles: false }))}${inc.running ? '' : ' (nekandiduje)'}`
            : `${o.candidates.length} kandidátů`;
        return `<li><button type="button" data-id="${o.id}"><span class="no">${o.id}</span>
          <span class="nm">${esc(o.name)}<small>${sub}</small></span>
          <span class="dots" aria-hidden="true">${o.candidates.map((c) => `<i class="${c.defends ? 'd' : ''}" style="background:${c.party.color}"></i>`).join('')}</span></button></li>`;
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
      Neoficiální přehled, závazné jsou výsledky na <a href="https://volby.gov.cz">volby.gov.cz</a>.</div>`;
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

function renderAll() {
  renderSubtitle();
  renderStatus();
  renderKpis();
  renderModes();
  renderMap();
  renderLegend();
  renderSide();
  table.update(tableState());
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
