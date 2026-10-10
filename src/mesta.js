// Okresní a krajská města 2026: kdo vyhrává komunální volby (mapa, přehled stran, změna proti roku 2022, tabulka).
// Data měst: public/data/kv-mesta.json (scripts/build-kv-mesta.mjs), výsledky se čtou živě z ČSÚ (src/kv-live.js).

import './style.css';
import './radnice.css';
import { geoMercator, geoPath } from 'd3-geo';
import { kvPartyStyle } from './kv-party.js';
import { fetchKvResult } from './kv-live.js';

const REFRESH_MS = 120_000;
const CONCURRENCY = 8;
const SVGNS = 'http://www.w3.org/2000/svg';
const MAP_W = 700;
const MAP_H = 460;
const LOCAL = { key: 'Místní', label: 'Místní / ostatní', color: '#64748b' };

const base = import.meta.env.BASE_URL;
const [data, geo] = await Promise.all([
  fetch(`${base}data/kv-mesta.json`).then((r) => r.json()),
  fetch(`${base}data/obvody.geojson`).then((r) => r.json()),
]);

const $ = (id) => document.getElementById(id);
const state = { filter: 'all', results: new Map() };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtPct = (x) => x.toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtInt = (x) => x.toLocaleString('cs-CZ');

/** Skupina podle strany uvedené v názvu listiny jako první; bez parlamentní strany = „Místní“. */
function group(nazev) {
  const s = kvPartyStyle(nazev);
  return s.label ? { key: s.label, label: s.label, color: s.color } : LOCAL;
}
const tag = (g) => `<span class="kv-tag" style="background:${g.color}">${esc(g.label)}</span>`;

/** Stav jednoho města: vítěz, náskok, úplnost sčítání (nebo null, dokud nejsou hlasy). */
function standing(city) {
  const res = state.results.get(city.kodzastup);
  if (!res || !res.ucast.okrskyZprac) return null;
  const sorted = [...res.listiny].sort((a, b) => b.hlasyProc - a.hlasyProc);
  const win = sorted[0];
  if (!win || !win.hlasy) return null;
  const g = group(win.nazev);
  const g22 = city.vitez2022 ? group(city.vitez2022.nazev) : null;
  return {
    win,
    g,
    lead: sorted[1] ? win.hlasyProc - sorted[1].hlasyProc : null,
    done: res.jeSpocteno || res.ucast.okrskyZpracProc >= 100,
    done_pct: res.ucast.okrskyZpracProc,
    changed: !!g22 && g22.key !== g.key,
    g22,
  };
}

const rows = () => data.mesta.map((city) => ({ city, st: standing(city) }));

// ---------- mapa ----------

const svg = $('ms-map');
const projection = geoMercator().fitExtent([[6, 6], [MAP_W - 6, MAP_H - 6]], geo);
const path = geoPath(projection);
const world = document.createElementNS(SVGNS, 'g');
svg.append(world);
for (const f of geo.features) {
  const p = document.createElementNS(SVGNS, 'path');
  p.setAttribute('d', path(f));
  p.setAttribute('class', 'kv-map-base');
  world.append(p);
}
const dots = new Map();
for (const city of data.mesta) {
  if (!city.lonLat) continue;
  const [x, y] = projection(city.lonLat);
  const c = document.createElementNS(SVGNS, 'circle');
  c.setAttribute('cx', x);
  c.setAttribute('cy', y);
  c.setAttribute('r', (3.2 + Math.sqrt(city.pocetObyv ?? 10000) / 130).toFixed(1));
  c.setAttribute('class', 'ms-dot');
  c.setAttribute('tabindex', '0');
  c.setAttribute('role', 'button');
  const t = document.createElementNS(SVGNS, 'title');
  c.append(t);
  c.addEventListener('click', () => jumpTo(city.kodzastup));
  c.addEventListener('keydown', (e) => (e.key === 'Enter' ? jumpTo(city.kodzastup) : null));
  world.append(c);
  dots.set(city.kodzastup, { c, t });
}

function renderMap() {
  for (const { city, st } of rows()) {
    const d = dots.get(city.kodzastup);
    if (!d) continue;
    d.c.setAttribute('fill', st ? st.g.color : '#e5e7eb');
    d.c.setAttribute('fill-opacity', st ? (st.done ? 1 : 0.6) : 1);
    d.c.classList.toggle('ms-dot--changed', !!st?.changed);
    d.t.textContent = st
      ? `${city.nazev}: ${st.win.nazev} ${fmtPct(st.win.hlasyProc)} % (${st.done ? 'sečteno' : `průběžně, sečteno ${fmtPct(st.done_pct)} % okrsků`})${st.changed ? ` · změna proti 2022 (${st.g22.label})` : ''}`
      : `${city.nazev}: čeká se na výsledky`;
  }
}

// ---------- souhrn, vítězové, změny ----------

function renderKpis(all) {
  const counted = all.filter((r) => r.st);
  const done = counted.filter((r) => r.st.done).length;
  const changed = counted.filter((r) => r.st.changed).length;
  const items = [
    { l: 'Sledovaných měst', v: all.length, s: `${all.filter((r) => r.city.typ === 'kraj').length} krajských` },
    { l: 'S výsledky', v: counted.length, s: `z toho sečteno úplně: ${done}` },
    { l: 'Vítěz se změnil', v: counted.length ? changed : '–', s: 'oproti roku 2022 (podle strany)' },
  ];
  $('ms-kpis').innerHTML = items
    .map((i) => `<div class="kpi"><div class="kpi-l">${i.l}</div><div class="kpi-v">${i.v}</div><div class="kpi-s">${i.s}</div></div>`)
    .join('');
}

function renderWins(all) {
  const counted = all.filter((r) => r.st);
  if (!counted.length) {
    $('ms-wins').innerHTML = '<p class="muted">Zatím nejsou k dispozici žádné výsledky. Mapa i přehled se samy doplní, jakmile je ČSÚ zveřejní.</p>';
    $('ms-legend').innerHTML = '';
    return;
  }
  const by = new Map();
  for (const { city, st } of counted) {
    const e = by.get(st.g.key) ?? { g: st.g, n: 0, kraj: 0 };
    e.n++;
    if (city.typ === 'kraj') e.kraj++;
    by.set(st.g.key, e);
  }
  const list = [...by.values()].sort((a, b) => b.n - a.n);
  const max = list[0].n;
  $('ms-wins').innerHTML = list
    .map(
      (e) => `<div class="ms-win"><span class="ms-win-l">${tag(e.g)}</span>
        <span class="ms-win-bar"><i style="width:${(e.n / max) * 100}%;background:${e.g.color}"></i></span>
        <span class="ms-win-n"><b>${e.n}</b>${e.kraj ? ` <span class="muted">(${e.kraj} krajských)</span>` : ''}</span></div>`,
    )
    .join('');
  $('ms-legend').innerHTML =
    list.map((e) => `<span class="kv-current-item"><i style="background:${e.g.color}"></i>${esc(e.g.label)}</span>`).join('') +
    '<span class="kv-current-item"><i style="background:#e5e7eb;border:1px solid #cbd5e1"></i>čeká se</span>' +
    '<span class="kv-current-item"><i class="ms-ring"></i>jiná strana než v 2022</span>';
}

function renderChanges(all) {
  const counted = all.filter((r) => r.st);
  if (!counted.length) {
    $('ms-changes').innerHTML = '<p class="muted">Porovnání bude k dispozici po prvních výsledcích.</p>';
    return;
  }
  const ch = counted.filter((r) => r.st.changed);
  $('ms-changes').innerHTML = ch.length
    ? `<ul class="ms-changes">${ch
        .map(({ city, st }) => `<li><b>${esc(city.nazev)}</b>: ${tag(st.g22)} → ${tag(st.g)}${st.done ? '' : ' <span class="muted">(průběžně)</span>'}</li>`)
        .join('')}</ul>`
    : '<p class="muted">Zatím se ve městech s výsledky vítěz nezměnil.</p>';
}

// ---------- tabulka ----------

function renderTable(all) {
  const shown = all.filter((r) => state.filter === 'all' || r.city.typ === state.filter);
  const head = '<thead><tr><th>Město</th><th class="num">Obyvatel</th><th class="num">Sečteno</th><th>Vítěz</th><th class="num">Náskok</th><th>Vítěz 2022</th><th></th></tr></thead>';
  const body = shown
    .map(({ city, st }) => {
      const g22 = city.vitez2022 ? group(city.vitez2022.nazev) : null;
      return `<tr id="ms-row-${city.kodzastup}">
        <td><b>${esc(city.nazev)}</b>${city.typ === 'kraj' ? ' <span class="badge badge--def">krajské</span>' : ''}</td>
        <td class="num">${city.pocetObyv ? fmtInt(city.pocetObyv) : '–'}</td>
        <td class="num">${st ? `${fmtPct(st.done_pct)} %` : '–'}</td>
        <td>${st ? `${tag(st.g)} ${esc(st.win.nazev)} <b>${fmtPct(st.win.hlasyProc)} %</b>${st.done ? '' : ' <span class="muted">(průběžně)</span>'}` : '<span class="muted">čeká se</span>'}</td>
        <td class="num">${st?.lead != null ? `${fmtPct(st.lead)} p. b.` : '–'}</td>
        <td>${g22 ? `${tag(g22)} <span class="muted">${city.vitez2022.proc != null ? `${fmtPct(city.vitez2022.proc)} %` : ''}</span>` : '–'}</td>
        <td>${st?.changed ? '<span class="badge badge--run">změna</span>' : ''}</td>
      </tr>`;
    })
    .join('');
  $('ms-table').innerHTML = `${head}<tbody>${body}</tbody>`;
}

function renderFilter() {
  const opts = [['all', 'Všechna'], ['kraj', 'Krajská'], ['okres', 'Okresní']];
  $('ms-filter').innerHTML = opts.map(([k, l]) => `<button type="button" data-k="${k}" class="${state.filter === k ? 'is-on' : ''}">${l}</button>`).join('');
  for (const b of $('ms-filter').querySelectorAll('button')) {
    b.addEventListener('click', () => {
      state.filter = b.dataset.k;
      render();
    });
  }
}

function jumpTo(kod) {
  if (state.filter !== 'all') {
    state.filter = 'all';
    render();
  }
  const tr = $(`ms-row-${kod}`);
  if (!tr) return;
  tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
  tr.classList.add('ms-hl');
  setTimeout(() => tr.classList.remove('ms-hl'), 2000);
}

function render() {
  const all = rows();
  renderKpis(all);
  renderWins(all);
  renderChanges(all);
  renderFilter();
  renderTable(all);
  renderMap();
}

// ---------- načítání výsledků (po několika městech najednou, ať se ČSÚ nezahltí) ----------

async function pollAll() {
  const queue = [...data.mesta];
  const worker = async () => {
    for (let m = queue.shift(); m; m = queue.shift()) {
      try {
        state.results.set(m.kodzastup, await fetchKvResult(data.resultsBase, m.kodzastup));
      } catch {
        // zůstane poslední známý výsledek
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  render();
}

render();
pollAll();
setInterval(pollAll, REFRESH_MS);
