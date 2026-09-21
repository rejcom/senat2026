// HTML karty obvodu a kandidáta – sdílí tooltip nad mapou i detail v postranním panelu.
import { fullName } from './data.js';
import { summarize, fmt1, fmtInt } from './stats.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Čitelná barva textu na barevném podkladu. */
export function inkFor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.42 ? '#1b1b1b' : '#ffffff';
}

export const chip = (party, label = party.short) =>
  `<span class="chip" style="--c:${party.color};--ink:${inkFor(party.color)}">${esc(label)}</span>`;

const plural = (n, one, few, many) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);
export const years = (n) => `${n} ${plural(n, 'rok', 'roky', 'let')}`;
const cand = (n) => `${n} ${plural(n, 'kandidát', 'kandidáti', 'kandidátů')}`;

function statusBadge(row) {
  if (row.status2 === 'ZVOLEN' || row.status1 === 'ZVOLEN') return '<span class="badge badge--won">zvolen(a)</span>';
  if (row.status2 === 'NEZVOLEN') return '<span class="badge badge--out">nezvolen(a)</span>';
  if (row.status1 === '2.KOLO') return '<span class="badge badge--run">2. kolo</span>';
  if (row.status1 === 'NEZVOLEN') return '<span class="badge badge--out">vypadl(a)</span>';
  return '';
}

function votesBlock(row, res) {
  const votes = res.round === 2 ? (row.votes2 ?? 0) : row.votes1;
  const pct = res.round === 2 ? row.pct2 : row.pct1;
  const sub = res.round === 2 ? `<span class="muted">1. kolo: ${fmtInt(row.votes1)} (${fmt1(row.pct1)} %)</span>` : '';
  return `<div class="cand-votes"><b>${fmtInt(votes)}</b><span>${fmt1(pct)} %</span>
    <div class="bar"><i style="width:${Math.min(100, pct)}%;background:${row.c.party.color}"></i></div>${sub}</div>`;
}

function candidateRow(c, { full, row, res }) {
  const p = c.party;
  const badges = [
    c.defends ? '<span class="badge badge--def" title="Současný senátor obvodu, který obhajuje mandát">obhajuje mandát</span>' : '',
    row ? statusBadge(row) : '',
  ].join('');
  const meta = [
    `<span class="dotc" style="background:${p.color}"></span>${esc(p.own ?? p.short)}`,
    years(c.age),
    c.gender === 'F' ? 'žena' : 'muž',
  ];
  const extra = full
    ? `<div class="cand-job">${esc(c.occupation)}</div>
       <div class="cand-more">Bydliště: ${esc(c.residence)} · ${c.member ? `člen(ka) ${esc(c.member)}` : 'bez politické příslušnosti'}${
         c.listName && c.listName !== p.name ? `<br>Kandiduje za: ${esc(c.listName)}` : ''
       }${c.senatorOf ? `<br><b>Současný senátor za obvod ${c.senatorOf.obvod} ${esc(c.senatorOf.name)}</b>` : ''}</div>`
    : `<div class="cand-job cand-job--clip">${esc(c.occupation)}</div>`;
  return `<li class="cand${c.defends ? ' is-defends' : ''}" data-uid="${c.uid}">
    <span class="cand-no" style="--c:${p.color};--ink:${inkFor(p.color)}">${c.no}</span>
    <div class="cand-main">
      <div class="cand-name">${esc(fullName(c))} ${badges}</div>
      <div class="cand-meta">${meta.join('<span class="sep">·</span>')}</div>
      ${extra}
    </div>
    ${row && res?.hasVotes ? votesBlock(row, res) : ''}
  </li>`;
}

function statsFooter(o) {
  const s = summarize(o.candidates);
  const names = (g) => g.list.map((c) => `${esc(fullName(c, { titles: false }))}`).join(', ');
  return `<div class="tt-stats">
    <div><span>Průměrný věk</span><b>${fmt1(s.meanAge)}</b></div>
    <div><span>Ženy / muži</span><b>${s.women} / ${s.men}</b></div>
    <div class="wide"><span>Nejmladší</span><b>${s.youngest.age}</b> ${names(s.youngest)}</div>
    <div class="wide"><span>Nejstarší</span><b>${s.oldest.age}</b> ${names(s.oldest)}</div>
  </div>`;
}

function turnoutLine(res) {
  const t = res?.turnout;
  if (!t || !res.hasVotes) return '';
  return `<div class="tt-progress">Sečteno ${t.precinctsDone} z ${t.precinctsTotal} okrsků (${fmt1(t.precinctsPct)} %) · účast ${fmt1(t.turnoutPct)} % · ${res.round}. kolo</div>`;
}

/** Karta obvodu, v němž se volí. */
export function obvodCard(o, { res = null, full = false } = {}) {
  const inc = o.incumbent;
  const incLine = inc
    ? `<div class="tt-inc">Mandát nyní drží <b>${esc(fullName(inc, { titles: false }))}</b> ${chip(inc.party)}
        ${inc.running ? '<span class="badge badge--def">kandiduje znovu</span>' : '<span class="badge badge--out">nekandiduje</span>'}</div>`
    : '';
  const useRows = res?.hasVotes;
  const list = useRows ? res.rows : o.candidates.map((c) => ({ c }));
  const items = list
    .map((r) => candidateRow(r.c, { full, row: useRows ? r : null, res }))
    .join('');
  return `<div class="tt">
    <div class="tt-head">
      <div class="tt-title">Obvod č. ${o.id} · ${esc(o.name)}</div>
      <div class="tt-sub">${cand(o.candidates.length)}${o.population ? ` · ${fmtInt(o.population)} obyvatel` : ''}</div>
    </div>
    ${incLine}
    ${turnoutLine(res)}
    <ul class="tt-list">${items}</ul>
    ${statsFooter(o)}
  </div>`;
}

/** Karta obvodu, v němž se letos nevolí. */
export function inactiveCard(id, name, other) {
  if (!other) return `<div class="tt"><div class="tt-head"><div class="tt-title">Obvod č. ${id}</div></div></div>`;
  const s = other.senator;
  return `<div class="tt">
    <div class="tt-head">
      <div class="tt-title">Obvod č. ${id} · ${esc(other.name)}</div>
      <div class="tt-sub">Letos se nevolí – příští volby ${other.nextElection}</div>
    </div>
    <div class="tt-inc">Senátor: <b>${esc(fullName(s, { titles: false }))}</b> ${chip(s.party)}<br>
      <span class="muted">rok zvolení ${s.electedYear}</span></div>
  </div>`;
}
