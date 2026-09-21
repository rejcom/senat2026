// Vysílací režim: sama se točící obrazovka s výsledky a automatickým komentářem (psaným i mluveným).
// Komentář se skládá z předem napsaných šablon (commentary.js), do kterých se dosazují jen čísla a jména z dat ČSÚ.
import './vysilani.css';
import { geoMercator, geoPath } from 'd3-geo';
import { loadData, fullName } from './data.js';
import { RESULTS_URL, REFRESH_MS } from './config.js';
import { createPoller, obvodResult } from './live.js';
import { demoXml, demoNightXml } from './demo.js';
import { createDirector } from './director.js';
import { createSpeaker } from './speech.js';
import { senateSvg, liveSeats } from './senate.js';
import { esc, inkFor } from './cards.js';
import { fmt1, fmtInt } from './stats.js';
import { screenName } from './pronunciation.js';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const params = new URLSearchParams(location.search);
const demoParam = params.get('demo');
const isNight = demoParam === 'noc';
const demoLevel = /^[123]$/.test(demoParam ?? '') ? Number(demoParam) : 0;
const isDemo = isNight || demoLevel > 0;
const nightMin = Number(params.get('min')) || 10;
const rate = Number(params.get('rychlost')) || 1;
if (params.get('bezovladani')) document.body.classList.add('clean');

const data = await loadData();
const state = {
  results: null,
  resMap: new Map(),
  anyVotes: false,
  status: { state: 'loading' },
  log: [], // události pro lištu
  paused: false,
  voiceOn: false,
  current: null,
};

// ---------- měřítko scény ----------

const stage = $('stage');
function fit() {
  const s = Math.min(innerWidth / 1920, innerHeight / 1080);
  stage.style.transform = `translate(-50%, -50%) scale(${s})`;
}
addEventListener('resize', fit);
fit();

// ---------- výsledky ----------

const t0 = Date.now();
const fetchText = isNight
  ? async () => demoNightXml(data.obvody, Math.min(1, (Date.now() - t0) / (nightMin * 60000)))
  : demoLevel
    ? async () => demoXml(data.obvody, demoLevel)
    : async () => {
        const r = await fetch(RESULTS_URL, { cache: 'no-cache' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      };

const director = createDirector({ obvody: data.obvody, cooldownMs: isNight ? 25000 : 4 * 60 * 1000 });

function recompute() {
  state.resMap = new Map();
  for (const o of data.obvody) {
    const r = obvodResult(o, state.results);
    if (r) state.resMap.set(o.id, r);
  }
  state.anyVotes = [...state.resMap.values()].some((r) => r.hasVotes);
}

const poller = createPoller({
  fetchText,
  interval: isNight ? 4000 : REFRESH_MS,
  background: true, // vysílání nesmí přestat stahovat, když je okno zakryté nebo minimalizované
  onData(results) {
    state.results = results;
    recompute();
    director.ingest(state.resMap);
    renderHeader();
    renderSeats();
  },
  onStatus(patch) {
    Object.assign(state.status, patch);
    renderHeader();
  },
});

// ---------- mini mapa ----------

const mini = (() => {
  const W = 700;
  const H = 300;
  const proj = geoMercator().fitExtent([[6, 6], [W - 6, H - 6]], data.geo);
  const path = geoPath(proj);
  const paths = new Map();
  let html = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  for (const f of data.geo.features) html += `<path data-id="${f.properties.id}" class="${f.properties.active ? 'on' : ''}" d="${path(f)}"/>`;
  $('minimap').innerHTML = html + '</svg>';
  for (const p of $('minimap').querySelectorAll('path')) paths.set(Number(p.dataset.id), p);
  return {
    show(id, color) {
      for (const [k, p] of paths) {
        p.classList.toggle('cur', k === id);
        if (k === id) {
          p.style.fill = color ?? '';
          p.parentNode.append(p); // dopředu, ať je obrys vidět celý
        } else p.style.fill = '';
      }
    },
  };
})();

// ---------- vykreslení ----------

const partyLabel = (c) => screenName(c.party);

function renderHeader() {
  const s = state.status;
  const el = $('hd-status');
  let cls = 'wait';
  let txt = 'Načítám data ČSÚ…';
  if (isDemo) {
    cls = 'demo';
    txt = 'DEMO – fiktivní data';
  } else if (s.state === 'error') {
    cls = 'err';
    txt = 'Data ČSÚ nedorazila, zkouším znovu';
  } else if (s.state === 'ok') {
    cls = state.anyVotes ? 'ok' : 'wait';
    txt = state.anyVotes ? `Živě · data ČSÚ z ${s.generatedAt ? s.generatedAt.toLocaleTimeString('cs-CZ') : '?'}` : 'Čekáme na první výsledky';
  }
  el.className = `live ${cls}`;
  el.innerHTML = `<i></i><span>${esc(txt)}</span>`;

  let done = 0;
  let total = 0;
  let elected = 0;
  let runoff = 0;
  for (const r of state.resMap.values()) {
    if (r.turnout) {
      done += r.turnout.precinctsDone;
      total += r.turnout.precinctsTotal;
    }
    if (r.state === 'elected') elected++;
    if (r.state === 'runoff') runoff++;
  }
  const pct = total ? (done / total) * 100 : 0;
  $('hd-counters').innerHTML =
    `<div class="cnt"><b>${fmt1(pct)} %</b><span>sečteno okrsků</span></div>` +
    `<div class="cnt"><b>${elected} / ${data.obvody.length}</b><span>obvodů rozhodnuto</span></div>` +
    `<div class="cnt"><b>${runoff}</b><span>míří do 2. kola</span></div>`;

  // stará data: ČSÚ se přestal aktualizovat
  const stale = !isDemo && state.status.generatedAt && Date.now() - state.status.generatedAt.getTime() > 6 * 60 * 1000 && state.anyVotes;
  const notice = $('notice');
  if (stale) {
    notice.hidden = false;
    notice.textContent = `Pozor: ČSÚ naposledy zveřejnil data v ${state.status.generatedAt.toLocaleTimeString('cs-CZ')}. Zobrazujeme poslední známý stav.`;
  } else if (s.state === 'error') {
    notice.hidden = false;
    notice.textContent = 'Spojení s ČSÚ se na chvíli přerušilo. Zobrazujeme poslední známý stav a zkoušíme to znovu.';
  } else notice.hidden = true;
}

setInterval(() => ($('hd-clock').textContent = new Date().toLocaleTimeString('cs-CZ')), 500);

let seatsKey = '';
function renderSeats() {
  const live = liveSeats(data.senate, state.resMap);
  const decided = [...live.values()].filter((v) => v.won).length;
  const key = `${decided}|${[...live.values()].map((v) => v.club?.id ?? '-').join('')}`;
  if (key === seatsKey) return;
  seatsKey = key;
  const { svg, legendItems } = senateSvg(data.senate, { theme: 'page', live: decided ? live : null, chairsOnly: true });
  const leg = legendItems
    .map((it) => `<div class="sl"><i style="${it.outline ? `border:3px solid ${it.color}` : `background:${it.color}`}"></i><div><b>${esc(it.name)}</b><span>${it.size} · ${esc(it.note)}</span></div></div>`)
    .join('');
  $('seats').innerHTML = `${svg}<div class="sleg">${leg}</div>`;
}

function rowHtml(r, i, res, maxPct) {
  const c = r.c;
  const pct = res.round === 2 ? r.pct2 : r.pct1;
  const votes = res.round === 2 ? (r.votes2 ?? 0) : r.votes1;
  const won = r.status2 === 'ZVOLEN' || r.status1 === 'ZVOLEN';
  const badges = [
    c.defends ? '<span class="bd">OBHAJUJE</span>' : '',
    won ? '<span class="bd w">ZVOLEN(A)</span>' : r.status1 === '2.KOLO' && res.round === 1 ? '<span class="bd r">2. KOLO</span>' : '',
  ].join('');
  return `<li class="row${c.defends ? ' is-def' : ''}${won ? ' is-w' : ''}" style="--c:${c.party.color};--ink2:${inkFor(c.party.color)}">
    <div class="rk">${i + 1}</div>
    <div><div class="nm">${esc(fullName(c, { titles: false }))}${badges}</div><div class="pt"><i></i>${esc(partyLabel(c))} · ${c.age} let</div></div>
    <div class="num"><b>${fmt1(pct)} %</b><span>${fmtInt(votes)} hlasů</span></div>
    <div class="bar"><i style="width:${Math.min(100, (pct / maxPct) * 100)}%"></i></div>
  </li>`;
}

function renderCard(o, res) {
  const t = res?.turnout;
  const stateTxt = !res?.hasVotes ? ['čeká se', ''] : res.state === 'elected' ? ['ROZHODNUTO', 'won'] : res.state === 'runoff' ? ['DO 2. KOLA', 'run'] : ['SČÍTÁ SE', 'cnt'];
  let body;
  if (res?.hasVotes) {
    const rows = res.rows.filter((r) => (res.round === 2 ? r.votes2 != null : true));
    const maxPct = Math.max(40, res.round === 2 ? rows[0].pct2 : rows[0].pct1);
    body = `<ol class="top">${rows.slice(0, 3).map((r, i) => rowHtml(r, i, res, maxPct)).join('')}</ol>`;
    if (rows.length > 3) {
      body += `<div class="more">Další: ${rows
        .slice(3)
        .map((r) => `${esc(fullName(r.c, { titles: false }))} ${fmt1(res.round === 2 ? r.pct2 : r.pct1)} %`)
        .join(' · ')}</div>`;
    }
  } else {
    body = `<ul class="pre">${o.candidates
      .map(
        (c) => `<li class="${c.defends ? 'is-def' : ''}" style="--c:${c.party.color};--ink2:${inkFor(c.party.color)}"><div class="rk">${c.no}</div>
        <div style="min-width:0"><div class="nm">${esc(fullName(c, { titles: false }))}${c.defends ? '<span class="bd">OBHAJUJE</span>' : ''}</div>
        <div class="pt"><i></i>${esc(partyLabel(c))} · ${c.age} let</div></div></li>`,
      )
      .join('')}</ul>`;
  }
  const prog = t
    ? `<div class="prog"><div class="prog-bar"><i style="width:${t.precinctsPct}%"></i></div><div class="prog-txt">Sečteno ${fmtInt(t.precinctsDone)} z ${fmtInt(t.precinctsTotal)} okrsků (${fmt1(t.precinctsPct)} %) · účast ${fmt1(t.turnoutPct)} % · ${res.round}. kolo</div></div>`
    : `<div class="prog"><div class="prog-txt">${o.candidates.length} kandidátů · výsledky zatím nejsou k dispozici</div></div>`;
  $('card').className = `card${res?.state === 'elected' ? ' is-won' : ''}`;
  $('card').innerHTML = `<div class="oh"><div class="oh-no">${o.id}</div>
      <div class="oh-name"><h2>${esc(o.name)}</h2><p>${o.population ? `${fmtInt(o.population)} obyvatel · ` : ''}${o.incumbent ? `mandát nyní drží ${esc(fullName(o.incumbent, { titles: false }))}` : ''}</p></div>
      <div class="state ${stateTxt[1]}">${stateTxt[0]}</div></div>${prog}${body}`;
}

const KIND = {
  intro: 'Vítejte',
  pre: 'Kandidáti',
  waiting: 'Čekáme na data',
  counting: 'Průběžný stav',
  leader_change: 'Změna na špici',
  close: 'Těsný souboj',
  runoff: 'Postup do 2. kola',
  elected: 'Rozhodnuto',
  overall: 'Přehled večera',
  disclaimer: 'Neoficiální přehled',
  final: 'Sčítání je u konce',
  recap: 'Shrnutí výsledků',
  outro: 'Děkujeme za sledování',
};

function renderBoard(hl = []) {
  const won = [];
  const run = [];
  let counting = 0;
  for (const o of data.obvody) {
    const r = state.resMap.get(o.id);
    if (r?.state === 'elected') won.push({ o, r });
    else if (r?.state === 'runoff') run.push({ o, r });
    else if (r?.hasVotes) counting++;
  }
  const pctOf = (x, r) => fmt1(r.round === 2 ? x.pct2 : x.pct1);
  const wonLi = won
    .map(({ o, r }) => `<li${hl.includes(o.id) ? ' class="hl"' : ''}><b>${o.id}</b><div><span class="bn">${esc(o.name)}</span><span class="bw" style="--c:${r.elected.c.party.color}">${esc(fullName(r.elected.c, { titles: false }))} · ${esc(partyLabel(r.elected.c))} · ${pctOf(r.elected, r)} %</span></div></li>`)
    .join('');
  const runLi = run
    .map(({ o, r }) => `<li${hl.includes(o.id) ? ' class="hl"' : ''}><b>${o.id}</b><div><span class="bn">${esc(o.name)}</span><span class="bw">${r.advancing.map((a) => `${esc(fullName(a.c, { titles: false }))} (${esc(partyLabel(a.c))}) ${fmt1(a.pct1)} %`).join(' × ')}</span></div></li>`)
    .join('');
  const head = `<div class="oh"><div class="oh-name"><h2>Výsledky zatím</h2><p>Rozhodnuto ${won.length} · do 2. kola míří ${run.length} · sčítá se ${counting} · zbývá ${data.obvody.length - won.length - run.length - counting}</p></div></div>`;
  if (won.length + run.length > 9) {
    // hodně výsledků: jednořádkové položky ve dvou sloupcích
    const one = (id, name, txt, color) => `<li${hl.includes(id) ? ' class="hl"' : ''}><b>${id}</b><span class="bn">${esc(name)}</span><span class="bw"${color ? ` style="--c:${color}"` : ''}>${txt}</span></li>`;
    const wonC = won.map(({ o, r }) => one(o.id, o.name, `${esc(r.elected.c.lastName)} (${esc(partyLabel(r.elected.c))}) ${pctOf(r.elected, r)} %`, r.elected.c.party.color)).join('');
    const runC = run.map(({ o, r }) => one(o.id, o.name, r.advancing.map((a) => `${esc(a.c.lastName)} ${fmt1(a.pct1)} %`).join(' × '))).join('');
    $('card').className = 'card';
    $('card').innerHTML = `${head}<div class="board compact"><h3>Zvoleni v 1. kole · ${won.length}</h3><ul class="two">${wonC || '<li class="none">zatím nikdo</li>'}</ul><h3>Postupují do 2. kola · ${run.length}</h3><ul class="two">${runC || '<li class="none">zatím žádný obvod</li>'}</ul></div>`;
    return;
  }
  $('card').className = 'card';
  $('card').innerHTML = `<div class="oh"><div class="oh-name"><h2>Výsledky zatím</h2><p>Rozhodnuto ${won.length} · do 2. kola míří ${run.length} · sčítá se ${counting} · zbývá ${data.obvody.length - won.length - run.length - counting}</p></div></div>
    <div class="board"><div><h3>Zvoleni v 1. kole</h3><ul>${wonLi || '<li class="none">zatím nikdo</li>'}</ul></div>
    <div><h3>Postupují do 2. kola</h3><ul>${runLi || '<li class="none">zatím žádný obvod</li>'}</ul></div></div>`;
}

function show(slot) {
  state.current = slot;
  const o = slot.obvodId ? data.obvodById.get(slot.obvodId) : null;
  const res = o ? state.resMap.get(o.id) : null;
  if (['overall', 'final', 'recap', 'outro'].includes(slot.kind) && [...state.resMap.values()].some((r) => r.state === 'elected' || r.state === 'runoff')) {
    renderBoard(slot.ids ?? []);
    mini.show(null, null);
  } else if (o) {
    renderCard(o, res);
    const lead = res?.elected ?? res?.leader;
    mini.show(o.id, lead ? lead.c.party.color : null);
  } else mini.show(null, null);
  $('kind').textContent = KIND[slot.kind] ?? '';
  const say = $('say');
  say.textContent = slot.text;
  const n = slot.text.length;
  say.style.fontSize = `${n <= 150 ? 32 : n <= 220 ? 28 : n <= 290 ? 25 : 22}px`;
  say.classList.remove('flash');
  void say.offsetWidth;
  say.classList.add('flash');

  if (['elected', 'runoff', 'leader_change', 'close'].includes(slot.kind)) {
    state.log.unshift(slot.text.split(/(?<=\.)\s/).slice(0, 2).join(' '));
    state.log.length = Math.min(state.log.length, 10);
    const el = $('ticker');
    el.textContent = state.log.join('   ●   ');
    el.style.setProperty('--dur', `${Math.max(30, el.textContent.length * 0.22)}s`);
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
  }
}

// ---------- hlas a hlavní smyčka ----------

const speaker = createSpeaker({ rate });
let skipNow = null;
const readMs = (text) => Math.min(28000, Math.max(9000, text.length * 70));

async function loop() {
  for (;;) {
    if (state.paused) {
      await sleep(300);
      continue;
    }
    const slot = director.next(state.resMap);
    show(slot);
    const skip = new Promise((r) => (skipNow = r));
    const work = Promise.all([sleep(slot.minMs ?? 12000), state.voiceOn ? speaker.speak(slot.speech) : sleep(readMs(slot.text))]);
    await Promise.race([work, skip]);
    speaker.cancel();
    await sleep(state.voiceOn ? 900 : 300);
  }
}

function setVoice(on) {
  state.voiceOn = on && !!speaker.voice;
  $('b-voice').textContent = `Hlas: ${state.voiceOn ? 'zapnut' : 'vypnut'}`;
  if (!state.voiceOn) speaker.cancel();
}
$('b-voice').onclick = () => setVoice(!state.voiceOn);
$('b-pause').onclick = () => {
  state.paused = !state.paused;
  $('b-pause').textContent = state.paused ? 'Pokračovat' : 'Pauza';
  if (state.paused) speaker.cancel();
};
$('b-skip').onclick = () => skipNow?.();
addEventListener('keydown', (e) => {
  if ($('start').style.display !== 'none') return;
  if (e.key === 'f' || e.key === 'F') document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
  else if (e.key === 'm' || e.key === 'M') setVoice(!state.voiceOn);
  else if (e.key === ' ') {
    e.preventDefault();
    $('b-pause').click();
  } else if (e.key === 'ArrowRight') skipNow?.();
});

// ---------- start ----------

$('start-note').textContent = isDemo ? `Režim DEMO${isNight ? ` – celý večer za ${nightMin} minut` : ''}: všechna čísla jsou vymyšlená.` : '';
$('go').onclick = async () => {
  const wantVoice = $('c-voice').checked;
  $('go').disabled = true;
  $('go').textContent = 'Připravuji…';
  let voiceMsg = '';
  if (wantVoice) {
    const v = await speaker.init(); // musí proběhnout v reakci na kliknutí, jinak prohlížeč zvuk zablokuje
    if (!v.ok) voiceMsg = v.reason;
    else voiceMsg = `Hlas: ${v.name}`;
  }
  $('start').style.display = 'none';
  $('ctl').hidden = false;
  setVoice(wantVoice);
  if (voiceMsg && !state.voiceOn) {
    const n = $('notice');
    n.hidden = false;
    n.textContent = `${voiceMsg} Komentář běží jen jako text.`;
    setTimeout(() => renderHeader(), 9000);
  }
  try {
    await navigator.wakeLock?.request('screen'); // ať počítač během vysílání nezhasne
  } catch {
    /* není podporováno */
  }
  poller.start();
  loop();
};

$('ticker').textContent = 'Neoficiální automatický přehled dat ČSÚ  ●  Závazné výsledky: volby.gov.cz  ●  Rozhodnuté obvody a změny na špici se objeví tady';
renderHeader();
renderSeats();
$('card').innerHTML = '<div class="oh"><div class="oh-name"><h2>Senátní volby 2026</h2><p>Spusťte vysílání tlačítkem.</p></div></div>';
