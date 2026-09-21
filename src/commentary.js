// Automatický komentář k výsledkům: předem napsané šablony, do kterých se dosazují VÝHRADNĚ čísla a jména z dat ČSÚ.
// Nic se nevymýšlí ani nedomýšlí. Text se skládá z jednoho zápisu šablony a vykreslí se dvakrát:
//   text   – pro obrazovku („20,1 %“)
//   speech – pro čtení nahlas („dvacet celých jedna procenta“ dělá hlasový engine z „20,1 procenta“)
//
// Pravidla češtiny: jména a názvy obvodů jsou VŽDY v 1. pádu (bez skloňování, ať program nikomu nezkomolí příjmení),
// slovesa jsou v přítomném/budoucím čase, kde se rod nedá obejít, bere se z údaje o pohlaví (obhájce/obhájkyně).

import { fullName } from './data.js';
import { screenName, speechName } from './pronunciation.js';

// ---------- značky, které se vykreslí zvlášť pro obrazovku a pro hlas ----------

const A = '';
const B = '';
const M = (kind, ...args) => `${A}${kind}|${args.join('|')}${B}`;

const dec = (x) => {
  const r = Math.round(x * 10) / 10;
  return r.toLocaleString('cs-CZ', { minimumFractionDigits: Number.isInteger(r) ? 0 : 1, maximumFractionDigits: 1 });
};
const plural = (n, one, few, many) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);

const P = (x) => M('pct', x); // procenta
const PI = (x) => M('pcti', x); // procenta v 7. pádě („s 17 procenty“)
const PP = (x) => M('pp', x); // procentní body (rozdíl)
const OBV = (id, name) => M('obv', id, name); // „Obvod č. 6 – Louny“ / „Obvod číslo 6, Louny“
const PARTY = (label, spoken) => M('party', label, spoken ?? label);
const OKR = (a, b) => M('okr', a, b);

const RENDER = {
  screen: {
    pct: (x) => `${dec(+x)} %`,
    pcti: (x) => `${dec(+x)} %`,
    pp: (x) => `${dec(+x)} ${Number.isInteger(Math.round(+x * 10) / 10) ? plural(Math.round(+x), 'procentní bod', 'procentní body', 'procentních bodů') : 'procentního bodu'}`,
    obv: (id, name) => `Obvod č. ${id} – ${name}`,
    party: (p) => p,
    okr: (a, b) => `${(+a).toLocaleString('cs-CZ')} z ${(+b).toLocaleString('cs-CZ')} okrsků`,
  },
  speech: {
    pct: (x) => {
      const r = Math.round(+x * 10) / 10;
      return `${dec(r)} ${Number.isInteger(r) ? plural(r, 'procento', 'procenta', 'procent') : 'procenta'}`;
    },
    pcti: (x) => {
      const r = Math.round(+x * 10) / 10;
      return `${dec(r)} ${Number.isInteger(r) ? (r === 1 ? 'procentem' : 'procenty') : 'procenta'}`;
    },
    pp: (x) => {
      const r = Math.round(+x * 10) / 10;
      return `${dec(r)} ${Number.isInteger(r) ? plural(r, 'procentní bod', 'procentní body', 'procentních bodů') : 'procentního bodu'}`;
    },
    obv: (id, name) => `Obvod číslo ${id}, ${name}`,
    party: (p, s) => s ?? p,
    okr: (a, b) => `${a} z ${b} okrsků`,
  },
};

function render(tpl, mode) {
  return tpl.replace(new RegExp(`${A}(\\w+)\\|([^${B}]*)${B}`, 'g'), (_, kind, args) => RENDER[mode][kind](...args.split('|')));
}
const compose = (tpl) => ({ text: render(tpl, 'screen'), speech: render(tpl, 'speech') });

// ---------- pomocníci ----------

const nameOf = (c) => fullName(c, { titles: false });
const labelOf = (c) => screenName(c.party);
const spokenOf = (c) => speechName(c.party);
const partyOf = (c) => PARTY(labelOf(c), spokenOf(c));
const who = (c) => `${nameOf(c)} (${partyOf(c)})`;
const gend = (p, m, f) => (p?.gender === 'F' ? f : m);
const ORD = ['', 'prvním', 'druhém', 'třetím', 'čtvrtém', 'pátém', 'šestém', 'sedmém', 'osmém', 'devátém'];
const pctOf = (row, res) => (res.round === 2 ? row.pct2 : row.pct1);
const top = (res, n) => res.rows.filter((r) => (res.round === 2 ? r.votes2 != null : true)).slice(0, n);
const defenderOf = (o) => o.candidates.find((c) => c.defends) ?? null;
const cnt = (n) => `${n} ${plural(n, 'kandidát', 'kandidáti', 'kandidátů')}`;

function out(kind, o, tpl, extra = {}) {
  return { kind, obvodId: o?.id ?? null, ...compose(tpl), ...extra };
}

// ---------- jednotlivé druhy komentářů ----------

export function commentIntro() {
  return out(
    'intro',
    null,
    'Vítejte u živého přehledu senátních voleb 2026. ' +
      'Sledujete neoficiální, automaticky vytvářený přehled. Komentář sestavuje počítač z čísel, která zveřejňuje Český statistický úřad, a nic si nedomýšlí. ' +
      'Závazné výsledky najdete na webu volby.gov.cz.',
  );
}

export function commentDisclaimer() {
  return out('disclaimer', null, 'Připomínáme: jde o neoficiální automatický přehled dat Českého statistického úřadu. Závazné výsledky jsou na webu volby.gov.cz.');
}

/** Před příchodem prvních výsledků: co se ví z kandidátní listiny. */
export function commentPre(o) {
  const inc = o.incumbent;
  const ages = o.candidates.map((c) => c.age);
  const young = o.candidates.find((c) => c.age === Math.min(...ages));
  const old = o.candidates.find((c) => c.age === Math.max(...ages));
  let tpl = `${OBV(o.id, o.name)}. V obvodu se o mandát uchází ${cnt(o.candidates.length)}. `;
  if (inc) {
    const again = defenderOf(o);
    tpl += again
      ? `Mandát nyní drží ${nameOf(inc)} (${partyOf(inc)}) a znovu kandiduje. `
      : `Mandát nyní drží ${nameOf(inc)} (${partyOf(inc)}), ${gend(inc, 'ten', 'ta')} už nekandiduje. `;
  }
  tpl += `Nejmladší kandidát: ${nameOf(young)}, ${young.age} let. Nejstarší: ${nameOf(old)}, ${old.age} let. Čekáme na první výsledky.`;
  return out('pre', o, tpl);
}

/** Probíhající sčítání (1. i 2. kolo) – první tři místa. */
export function commentCounting(o, res, { variant = 0, prefix = '' } = {}) {
  const t = top(res, 3);
  const [a, b, c] = t;
  const done = res.turnout;
  const head = res.round === 2 ? 'Druhé kolo. ' : '';
  const sec = done ? `Sečteno ${OKR(done.precinctsDone, done.precinctsTotal)}. ` : '';
  let tpl = prefix + head;

  if (variant % 2 === 0) {
    tpl += `${OBV(o.id, o.name)}. ${sec}Vede ${who(a.c)} s ${PI(pctOf(a, res))}. `;
    if (b) tpl += `Na druhém místě je ${who(b.c)} s ${PI(pctOf(b, res))}`;
    if (c) tpl += `, na třetím ${who(c.c)} s ${PI(pctOf(c, res))}`;
    if (b) tpl += '. ';
  } else {
    tpl += `Průběžný stav v obvodu číslo ${o.id}, ${o.name}. ${sec}První je ${who(a.c)} s ${PI(pctOf(a, res))}`;
    if (b) tpl += `, na druhém místě ${who(b.c)} s ${PI(pctOf(b, res))}`;
    if (c) tpl += `, na třetím ${who(c.c)} s ${PI(pctOf(c, res))}`;
    tpl += '. ';
  }

  const margin = b ? pctOf(a, res) - pctOf(b, res) : null;
  if (margin != null && margin < 1) tpl += `Souboj o první místo je zatím velmi těsný, rozdíl je jen ${PP(margin)}. `;

  const def = defenderOf(o);
  if (def) {
    const rank = res.rows.findIndex((r) => r.c === def) + 1;
    const role = gend(def, 'obhájce mandátu', 'obhájkyně mandátu');
    if (rank === 1) tpl += `Vede ${role}. `;
    else if (rank > 1) tpl += `Zatím na ${ORD[rank] ?? `${rank}.`} místě je ${role}, ${nameOf(def)}. `;
  }
  if (res.turnout && variant % 3 === 0) tpl += `Volební účast zatím činí ${P(res.turnout.turnoutPct)}. `;
  return out('counting', o, tpl.trim(), { leaderUid: a.c.uid, margin });
}

/** Obvod je rozhodnutý. */
export function commentElected(o, res, { short = false } = {}) {
  const w = res.elected;
  const def = defenderOf(o);
  const inc = o.incumbent;
  const second = res.rows.find((r) => r !== w && (res.round === 2 ? r.votes2 != null : true));
  let tpl = `${OBV(o.id, o.name)}: rozhodnuto. `;
  tpl +=
    res.round === 2
      ? `Druhé kolo rozhodlo. Mandát získává ${who(w.c)} s ${PI(pctOf(w, res))} hlasů`
      : `Mandát získává už v prvním kole ${who(w.c)} s ${PI(pctOf(w, res))} hlasů`;
  tpl += second && !short ? `. Na druhém místě: ${nameOf(second.c)} s ${PI(pctOf(second, res))}. ` : '. ';
  if (def && def === w.c) tpl += 'Mandát je obhájen. ';
  else if (def) tpl += `Dosavadní ${gend(def, 'senátor', 'senátorka')} ${nameOf(def)} mandát neobhájí. `;
  else if (inc) tpl += `Dosavadní ${gend(inc, 'senátor', 'senátorka')} ${nameOf(inc)} nekandidoval${gend(inc, '', 'a')}. `;
  return out('elected', o, tpl.trim(), { leaderUid: w.c.uid });
}

/** 1. kolo je uzavřeno, míří se do 2. kola. */
export function commentRunoff(o, res, { withDate = false, short = false } = {}) {
  const adv = res.advancing;
  const def = defenderOf(o);
  let tpl = `${OBV(o.id, o.name)}: první kolo je uzavřeno. `;
  tpl += `Do druhého kola postupují ${adv.map((r) => `${who(r.c)} s ${PI(r.pct1)}`).join(' a ')}. `;
  if (def && !short) {
    tpl += adv.some((r) => r.c === def)
      ? `Mezi nimi je ${gend(def, 'obhájce', 'obhájkyně')} mandátu. `
      : `${gend(def, 'Obhájce', 'Obhájkyně')} mandátu, ${nameOf(def)}, do druhého kola nepostupuje. `;
  }
  if (withDate) tpl += 'Druhé kolo se koná 16. a 17. října.';
  return out('runoff', o, tpl, { leaderUid: adv[0]?.c.uid });
}

/** Událost: změna na prvním místě. */
export function commentLeaderChange(o, res, prevName) {
  const [a, b] = top(res, 2);
  let tpl = `Změna na špici v obvodu č. ${o.id}, ${o.name}: nově vede ${who(a.c)} s ${PI(pctOf(a, res))}. `;
  if (prevName && prevName !== nameOf(a.c)) tpl += `Dosavadní lídr: ${prevName}. `;
  if (b) tpl += `Rozdíl je ${PP(pctOf(a, res) - pctOf(b, res))}. `;
  const def = defenderOf(o);
  if (def && def === a.c) tpl += `Vede ${gend(def, 'obhájce', 'obhájkyně')} mandátu.`;
  return out('leader_change', o, tpl.trim(), { leaderUid: a.c.uid });
}

/** Událost: těsný souboj o první místo. */
export function commentClose(o, res) {
  const [a, b] = top(res, 2);
  const tpl = `Těsný souboj: ${OBV(o.id, o.name)}. První je ${who(a.c)} s ${PI(pctOf(a, res))}, druhý ${who(b.c)} s ${PI(pctOf(b, res))}. Rozdíl je jen ${PP(pctOf(a, res) - pctOf(b, res))}.`;
  return out('close', o, tpl, { leaderUid: a.c.uid });
}

/** Souhrn celého večera. */
export function commentOverall(obvody, resMap) {
  let done = 0;
  let total = 0;
  let elected = 0;
  let runoff = 0;
  const leads = new Map();
  for (const o of obvody) {
    const r = resMap.get(o.id);
    if (r?.turnout) {
      done += r.turnout.precinctsDone;
      total += r.turnout.precinctsTotal;
    }
    if (!r?.hasVotes) continue;
    if (r.state === 'elected') elected++;
    if (r.state === 'runoff') runoff++;
    const lead = r.elected ?? r.leader;
    if (lead) {
      const k = labelOf(lead.c);
      const e = leads.get(k) ?? { n: 0, spoken: spokenOf(lead.c) };
      e.n++;
      leads.set(k, e);
    }
  }
  const best = [...leads.entries()].map(([p, e]) => [p, e.n, e.spoken]).sort((x, y) => y[1] - x[1]);
  const pct = total ? (done / total) * 100 : 0;
  let tpl = `Přehled večera. Ve všech obvodech je sečteno ${OKR(done, total)}, tedy ${P(pct)}. `;
  tpl += `Rozhodnuto je ${elected} z ${obvody.length} obvodů`;
  tpl += runoff ? `, do druhého kola míří ${runoff}. Druhé kolo se koná 16. a 17. října. ` : '. ';
  if (best.length) {
    const n = best[0][1];
    const tied = best.filter(([, k]) => k === n);
    if (tied.length === 1) tpl += `Nejvíc obvodů zatím vede ${PARTY(tied[0][0], tied[0][2])}, celkem ${n} ${plural(n, 'obvod', 'obvody', 'obvodů')}.`;
    else if (tied.length <= 3 && n >= 2) tpl += `Nejvíc obvodů, ${n}, zatím vedou ${tied.map(([p, , s]) => PARTY(p, s)).join(' a ')}.`;
  }
  return out('overall', null, tpl.trim());
}

/** Čekáme na data. */
export function commentWaiting() {
  return out('waiting', null, 'Čekáme na první výsledky. Jakmile je Český statistický úřad zveřejní, objeví se tady.');
}

// ---------- závěr vysílání: sčítání je u konce, shrnutí všech výsledků ----------

/** Konec sčítání a shrnutí čísel. */
export function commentFinalIntro(obvody, resMap) {
  let done = 0;
  let total = 0;
  let elected = 0;
  let runoff = 0;
  for (const o of obvody) {
    const r = resMap.get(o.id);
    if (r?.turnout) {
      done += r.turnout.precinctsDone;
      total += r.turnout.precinctsTotal;
    }
    if (r?.state === 'elected') elected++;
    if (r?.state === 'runoff') runoff++;
  }
  const pct = total ? (done / total) * 100 : 0;
  let tpl = `Sčítání je u konce. Ve všech obvodech je sečteno ${OKR(done, total)}, tedy ${P(pct)}. `;
  tpl += `Zvoleno je ${elected} ${plural(elected, 'senátor', 'senátoři', 'senátorů')} z ${obvody.length} obvodů`;
  tpl += runoff ? `, do druhého kola míří ${runoff}. Druhé kolo se koná 16. a 17. října. ` : '. ';
  tpl += 'Teď ještě jednou shrneme všechny výsledky podle obvodů.';
  return out('final', null, tpl);
}

/** Zvolení – dávka obvodů. items = [{ o, r }] */
export function commentRecapElected(items, part, parts) {
  const head = part > 1 ? 'Dále zvoleni. ' : 'Zvoleni. ';
  const body = items
    .map(({ o, r }) => `${OBV(o.id, o.name)}: ${who(r.elected.c)}, ${P(pctOf(r.elected, r))}${r.round === 2 ? ', ve druhém kole' : ''}`)
    .join('. ');
  return out('recap', null, `${head}${body}.`, { ids: items.map((x) => x.o.id) });
}

/** Postupující do 2. kola – dávka obvodů. */
export function commentRecapRunoff(items, part, parts) {
  const head = part > 1 ? 'Dále postupují. ' : 'Do druhého kola postupují. ';
  const body = items.map(({ o, r }) => `${OBV(o.id, o.name)}: ${r.advancing.map((a) => who(a.c)).join(' a ')}`).join('. ');
  return out('recap', null, `${head}${body}.`, { ids: items.map((x) => x.o.id) });
}

export function commentOutro() {
  return out('outro', null, 'To jsou všechny výsledky. Děkujeme za sledování. Údaje zveřejňuje Český statistický úřad, závazné výsledky najdete na webu volby.gov.cz.');
}
