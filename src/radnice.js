// Zastupitelstva měst 2026: kandidátní listiny + živé výsledky (komunální volby), pro vybraná města
// (viz scripts/build-kv-data.mjs). Samostatná stránka, nezávislá na senátní části aplikace.

import './style.css';
import './radnice.css';
import { kvPartyStyle } from './kv-party.js';
import { fetchKvResult } from './kv-live.js';
import { initKvMap } from './kv-map.js';

const REFRESH_MS = 60_000;

const tabsEl = document.getElementById('kv-tabs');
const kpisEl = document.getElementById('kv-kpis');
const listEl = document.getElementById('kv-list');
const mapSvg = document.getElementById('kv-map');

const base = import.meta.env.BASE_URL;
const [data, geo] = await Promise.all([
  fetch(`${base}data/kv-candidates.json`).then((r) => r.json()),
  fetch(`${base}data/obvody.geojson`).then((r) => r.json()),
]);

const state = {
  cityIdx: 0,
  results: new Map(), // kodzastup -> výsledek z ČSÚ (nebo null, pokud se ještě nepodařilo načíst)
  expanded: new Set(), // ostrana listin, které mají rozbalený seznam kandidátů
};

const fmtPct = (x) => x.toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtInt = (x) => x.toLocaleString('cs-CZ');

function fullName(c) {
  const core = `${c.jmeno} ${c.prijmeni}`;
  return `${c.titulPred ? c.titulPred + ' ' : ''}${core}${c.titulZa ? ', ' + c.titulZa : ''}`;
}

function renderTabs() {
  tabsEl.innerHTML = data.mesta
    .map((m, i) => `<button type="button" data-i="${i}" class="${i === state.cityIdx ? 'is-on' : ''}">${m.nazev}</button>`)
    .join('');
  for (const btn of tabsEl.querySelectorAll('button')) {
    btn.addEventListener('click', () => selectCity(+btn.dataset.i));
  }
}

function renderKpis(city, result) {
  const kandidatuCelkem = city.listiny.reduce((s, l) => s + l.kandidati.length, 0);
  const items = [
    { l: 'Mandátů k obsazení', v: city.mandaty },
    { l: 'Kandidátních listin', v: city.listiny.length },
    { l: 'Kandidátů celkem', v: fmtInt(kandidatuCelkem) },
    { l: 'Obyvatel', v: city.pocetObyv ? fmtInt(city.pocetObyv) : '–' },
  ];
  if (result) {
    items.push(
      { l: 'Sečteno okrsků', v: `${result.ucast.okrskyZprac} z ${result.ucast.okrskyCelkem}`, s: `${fmtPct(result.ucast.okrskyZpracProc)} %` },
      { l: 'Účast', v: result.ucast.okrskyZprac ? `${fmtPct(result.ucast.ucastProc)} %` : '–' },
    );
  }
  kpisEl.innerHTML = items
    .map(
      (it) => `<div class="kpi"><div class="kpi-l">${it.l}</div><div class="kpi-v">${it.v ?? '–'}</div>${it.s ? `<div class="kpi-s">${it.s}</div>` : ''}</div>`,
    )
    .join('');
}

function renderList(city, result) {
  const counted = !!result && result.ucast.okrskyZprac > 0;
  const byOstrana = new Map((result?.listiny ?? []).map((r) => [r.ostrana, r]));

  const rows = city.listiny.map((l) => ({ list: l, res: byOstrana.get(l.ostrana) ?? null }));
  rows.sort((a, b) => (counted ? (b.res?.hlasyProc ?? 0) - (a.res?.hlasyProc ?? 0) : a.list.poradi - b.list.poradi));

  listEl.innerHTML = rows
    .map(({ list, res }) => {
      const { color, label } = kvPartyStyle(list.nazev);
      const expanded = state.expanded.has(list.ostrana);
      const pct = res ? Math.min(100, (res.hlasyProc / Math.max(...rows.map((r) => r.res?.hlasyProc ?? 0), 1)) * 100) : 0;
      const seatsBadge =
        counted && res
          ? `<span class="kv-seats" title="Mandáty v zastupitelstvu">${res.zastupitelePocet} mandát${res.zastupitelePocet === 1 ? '' : res.zastupitelePocet >= 2 && res.zastupitelePocet <= 4 ? 'y' : 'ů'}</span>`
          : '';
      const voteInfo = res
        ? counted
          ? `<span class="kv-votes">${fmtInt(res.hlasy)} hlasů · ${fmtPct(res.hlasyProc)} %</span>`
          : `<span class="kv-votes muted">čeká se na výsledky</span>`
        : '';
      return `
        <article class="kv-card" style="--kv-color:${color}">
          <button type="button" class="kv-card-head" data-toggle="${list.ostrana}" aria-expanded="${expanded}">
            <span class="kv-bar"></span>
            <span class="kv-name">
              ${label ? `<span class="kv-tag" style="background:${color}">${label}</span> ` : ''}
              <b>${esc(list.nazev)}</b>
              ${list.zkratka && list.zkratka !== list.nazev ? `<span class="muted"> (${esc(list.zkratka)})</span>` : ''}
            </span>
            <span class="kv-meta">
              <span class="muted">${list.kandidati.length} kandidátů</span>
              ${voteInfo}
              ${seatsBadge}
            </span>
            <span class="kv-chevron" aria-hidden="true">${expanded ? '▲' : '▼'}</span>
          </button>
          ${counted && res ? `<div class="kv-progress"><i style="width:${pct}%;background:${color}"></i></div>` : ''}
          ${expanded ? renderCandidates(list) : ''}
        </article>`;
    })
    .join('');

  for (const btn of listEl.querySelectorAll('[data-toggle]')) {
    btn.addEventListener('click', () => {
      const key = btn.dataset.toggle;
      if (state.expanded.has(key)) state.expanded.delete(key);
      else state.expanded.add(key);
      renderList(city, state.results.get(city.kodzastup));
    });
  }
}

function renderCandidates(list) {
  const rows = list.kandidati
    .map(
      (c) => `<li><span class="kv-c-no">${c.poradi}.</span> <b>${esc(fullName(c))}</b>${c.vek ? `, ${c.vek} let` : ''}${
        c.povolani ? `<br><span class="muted">${esc(c.povolani)}${c.bydliste ? ` · ${esc(c.bydliste)}` : ''}</span>` : ''
      }</li>`,
    )
    .join('');
  return `<ol class="kv-candidates">${rows}</ol>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function render() {
  const city = data.mesta[state.cityIdx];
  const result = state.results.get(city.kodzastup) ?? null;
  renderTabs();
  renderKpis(city, result);
  renderList(city, result);
}

function selectCity(i) {
  state.expanded.clear();
  state.cityIdx = i;
  render();
  tabsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const updateMapColors = initKvMap(mapSvg, geo, data.mesta, selectCity);

function leadingColor(cityIdx) {
  const city = data.mesta[cityIdx];
  const result = state.results.get(city.kodzastup);
  if (!result || result.ucast.okrskyZprac === 0) return null; // ještě nesečteno – zůstane neutrální tečka
  const top = result.listiny.reduce((a, b) => (b.hlasyProc > (a?.hlasyProc ?? -1) ? b : a), null);
  const list = city.listiny.find((l) => l.ostrana === top?.ostrana);
  return list ? kvPartyStyle(list.nazev).color : null;
}

async function pollAllCities() {
  await Promise.all(
    data.mesta.map(async (m) => {
      try {
        state.results.set(m.kodzastup, await fetchKvResult(data.resultsBase, m.kodzastup));
      } catch {
        // ponechá se poslední známý výsledek (nebo nic, když se ještě nikdy nepodařilo načíst)
      }
    }),
  );
  render();
  updateMapColors(leadingColor);
}

render();
updateMapColors(leadingColor);
pollAllCities();
setInterval(pollAllCities, REFRESH_MS);
