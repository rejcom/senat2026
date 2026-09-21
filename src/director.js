// „Režisér“ vysílání: rozhoduje, který obvod a jaký komentář přijde na řadu.
// Nejdřív události (rozhodnuto, postup do 2. kola, změna na špici, těsný souboj), jinak obvod, který se dlouho neukázal.
// Čistá logika bez prohlížeče, takže jde testovat v Node.

import {
  commentIntro,
  commentDisclaimer,
  commentPre,
  commentCounting,
  commentElected,
  commentRunoff,
  commentLeaderChange,
  commentClose,
  commentOverall,
  commentWaiting,
  commentFinalIntro,
  commentRecapElected,
  commentRecapRunoff,
  commentOutro,
} from './commentary.js';

const PRIO = { elected: 100, runoff: 90, leader_change: 70, close: 50, first: 40 };
const MAX_AGE_MS = 6 * 60 * 1000; // starší události (mimo rozhodnutí) se zahodí
const FIRST_MAX_AGE_MS = 90 * 1000; // „první čísla“ rychle zastarají
const CLOSE_SAY_MAX = 1.2; // „těsný souboj“ jen dokud je rozdíl opravdu malý (p. b.)
const FIRST_MAX_DONE_PCT = 30; // a smí se tak říkat, jen dokud je sečteno málo okrsků

const marginNow = (r) => (r.round === 2 ? r.rows[0].pct2 - r.rows[1].pct2 : r.rows[0].pct1 - r.rows[1].pct1);

export function createDirector({ obvody, now = () => Date.now(), cooldownMs = 4 * 60 * 1000, overallEvery = 7, disclaimerEvery = 18 } = {}) {
  const byId = new Map(obvody.map((o) => [o.id, o]));
  const lastShown = new Map(); // obvod -> čas posledního zobrazení
  const lastEvent = new Map(); // `${obvod}:${druh}` -> čas poslední události
  const events = [];
  const seenFirst = new Set();
  let prev = new Map();
  let slot = 0;
  let saidRunoffDate = false;
  let saidFirstNumbers = false; // „první čísla“ se řekne jen jednou, dál už „další čísla“
  let laterNumbers = 0;
  const recap = []; // fronta závěrečného shrnutí
  let finalSig = null;

  const summarize = (r) => ({
    votes: !!r?.hasVotes,
    leader: r?.leader?.c.uid ?? null,
    leaderName: r?.leader ? `${r.leader.c.firstName} ${r.leader.c.lastName}` : null,
    state: r?.state ?? 'none',
    margin: r?.rows?.length > 1 && r.hasVotes ? (r.round === 2 ? (r.rows[0].pct2 - r.rows[1].pct2) : (r.rows[0].pct1 - r.rows[1].pct1)) : null,
    done: r?.turnout?.precinctsPct ?? 0,
  });

  /** Porovná nové výsledky s minulými a zapíše události. */
  function ingest(resMap) {
    const t = now();
    const next = new Map();
    for (const o of obvody) {
      const r = resMap.get(o.id);
      const cur = summarize(r);
      next.set(o.id, cur);
      const was = prev.get(o.id);
      if (!cur.votes) continue;

      const push = (kind, extra = {}, cooldown = true) => {
        const key = `${o.id}:${kind}`;
        if (cooldown && t - (lastEvent.get(key) ?? -Infinity) < cooldownMs) return;
        lastEvent.set(key, t);
        events.push({ kind, obvodId: o.id, prio: PRIO[kind], at: t, ...extra });
      };

      if (cur.state === 'elected' && was?.state !== 'elected') push('elected', {}, false);
      else if (cur.state === 'runoff' && was?.state !== 'runoff') push('runoff', {}, false);
      else if (cur.state === 'counting') {
        if (!was?.votes && !seenFirst.has(o.id)) {
          seenFirst.add(o.id);
          push('first', {}, false);
        }
        if (was?.leader && cur.leader && was.leader !== cur.leader && cur.done >= 3) push('leader_change', { prevName: was.leaderName });
        else if (cur.margin != null && cur.margin < 0.6 && cur.done >= 20 && (was?.margin == null || was.margin >= 0.6)) push('close');
      }
    }
    prev = next;
  }

  /** Vrací podpis stavu, když je všude sečteno a rozhodnuto; jinak null. */
  function finalSignature(resMap) {
    const parts = [];
    for (const o of obvody) {
      const r = resMap.get(o.id);
      if (!r?.hasVotes || (r.state !== 'elected' && r.state !== 'runoff')) return null;
      if (r.turnout && r.turnout.precinctsDone < r.turnout.precinctsTotal) return null;
      parts.push(`${o.id}:${r.state}:${r.elected?.c.uid ?? r.advancing.map((a) => a.c.uid).join('+')}`);
    }
    return parts.join('|');
  }

  function buildRecap(resMap) {
    const won = [];
    const run = [];
    for (const o of obvody) {
      const r = resMap.get(o.id);
      if (r.state === 'elected') won.push({ o, r });
      else run.push({ o, r });
    }
    const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
    const out = [{ ...commentFinalIntro(obvody, resMap), minMs: 14000 }];
    const w = chunk(won, 4);
    w.forEach((c, i) => out.push({ ...commentRecapElected(c, i + 1, w.length), minMs: 12000 }));
    const r = chunk(run, 3);
    r.forEach((c, i) => out.push({ ...commentRecapRunoff(c, i + 1, r.length), minMs: 12000 }));
    out.push({ ...commentOutro(), minMs: 10000 });
    return out;
  }

  function buildFor(o, res, variant, prefix = '', short = false) {
    if (!res?.hasVotes) return commentPre(o);
    if (res.state === 'elected') return commentElected(o, res, { short });
    if (res.state === 'runoff') {
      const withDate = !saidRunoffDate;
      saidRunoffDate = true;
      return commentRunoff(o, res, { withDate, short });
    }
    return commentCounting(o, res, { variant, prefix });
  }

  /** Vybere další obvod a komentář. */
  function next(resMap) {
    const t = now();
    slot++;
    const anyVotes = [...resMap.values()].some((r) => r.hasVotes);

    if (slot === 1) return { ...commentIntro(), minMs: 15000 };

    // 00) rozjetý závěrečný souhrn se dočte celý
    if (recap.length) return recap.shift();

    // 0) pravidelný souhrn (s tabulkou výsledků) má přednost i při dlouhé frontě, ať divák vidí všechno
    if (anyVotes && slot % overallEvery === 0) return { ...commentOverall(obvody, resMap), minMs: 12000 };

    // 1) události podle důležitosti
    const fresh = events.filter((e) => e.kind === 'elected' || e.kind === 'runoff' || t - e.at <= (e.kind === 'first' ? FIRST_MAX_AGE_MS : MAX_AGE_MS));
    events.length = 0;
    events.push(...fresh);
    if (events.length) {
      events.sort((a, b) => b.prio - a.prio || a.at - b.at);
      const ev = events.shift();
      const short = events.length >= 4; // velká fronta: kratší oznámení
      const o = byId.get(ev.obvodId);
      const res = resMap.get(ev.obvodId);
      lastShown.set(o.id, t);
      let c;
      if (!res?.hasVotes) c = commentPre(o);
      else if (ev.kind === 'leader_change' && res.state === 'counting') c = commentLeaderChange(o, res, ev.prevName);
      else if (ev.kind === 'close' && res.state === 'counting' && res.rows.length > 1 && marginNow(res) < CLOSE_SAY_MAX) c = commentClose(o, res); // tvrzení musí platit i v okamžiku vyslovení
      else if (ev.kind === 'first' && res.state === 'counting') {
        const early = (res.turnout?.precinctsPct ?? 100) <= FIRST_MAX_DONE_PCT;
        // „první čísla“ platí jen jednou za večer, u dalších obvodů jde o „další čísla“
        let prefix = '';
        if (early) prefix = !saidFirstNumbers ? 'Dorazila první čísla. ' : laterNumbers++ % 2 === 0 ? 'Dorazila další čísla. ' : 'Přibyla čísla z dalšího obvodu. ';
        saidFirstNumbers = true;
        c = commentCounting(o, res, { variant: slot, prefix });
      }
      else c = buildFor(o, res, slot, '', short);
      return { ...c, event: ev.kind, minMs: short ? 9000 : 13000 };
    }

    // 1b) sčítání je u konce a všechno je oznámeno: závěrečné shrnutí všech výsledků (jednou pro každý stav)
    const sig = finalSignature(resMap);
    if (sig && sig !== finalSig) {
      finalSig = sig;
      recap.push(...buildRecap(resMap));
      return recap.shift();
    }

    // 2) občas upozornění, že jde o neoficiální přehled
    if (slot % disclaimerEvery === 0) return { ...commentDisclaimer(), minMs: 10000 };

    // 3) jinak obvod, který se nejdéle neukázal; těsné souboje mají přednost, rozhodnuté ustupují
    if (!anyVotes) {
      const o = [...obvody].sort((a, b) => (lastShown.get(a.id) ?? -1) - (lastShown.get(b.id) ?? -1))[0];
      lastShown.set(o.id, t);
      return slot % 5 === 0 ? { ...commentWaiting(), minMs: 9000 } : { ...commentPre(o), minMs: 13000 };
    }
    const score = (o) => {
      const r = resMap.get(o.id);
      if (!r?.hasVotes) return -Infinity;
      const age = t - (lastShown.get(o.id) ?? -600000);
      const close = r.state === 'counting' && r.rows.length > 1 && (r.rows[0].pct1 - r.rows[1].pct1) < 2 ? 45000 : 0;
      const decided = r.state === 'elected' || r.state === 'runoff' ? -90000 : 0;
      return age + close + decided;
    };
    const o = [...obvody].sort((a, b) => score(b) - score(a))[0];
    lastShown.set(o.id, t);
    return { ...buildFor(o, resMap.get(o.id), slot), minMs: 13000 };
  }

  return { ingest, next, byId };
}
