// Živé výsledky z ČSÚ: stažení XML, parsování podle se_vysledky.xsd a odvození stavu obvodu.

const num = (v) => (v == null || v === '' ? 0 : Number(v));
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Rozparsuje vysledky.xml do map podle čísla obvodu. */
export function parseResults(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Odpověď ČSÚ není platné XML.');
  const root = doc.documentElement;
  const err = root.getElementsByTagNameNS('*', 'CHYBA')[0];
  if (err) throw new Error(err.textContent.trim() || 'ČSÚ hlásí chybu při získávání výsledků.');

  const byObvod = new Map();
  for (const o of root.getElementsByTagNameNS('*', 'OBVOD')) {
    const id = num(o.getAttribute('CISLO'));
    const cands = new Map();
    const turnout = {};
    for (const el of o.children) {
      if (el.localName === 'KANDIDAT') {
        cands.set(num(el.getAttribute('PORADOVE_CISLO')), {
          lastName: el.getAttribute('PRIJMENI') ?? '',
          votes1: num(el.getAttribute('HLASY_1KOLO')),
          pct1: num(el.getAttribute('HLASY_PROC_1KOLO')),
          status1: el.getAttribute('ZVOLEN_1KOLO'), // ZVOLEN | NEZVOLEN | 2.KOLO | null
          votes2: el.hasAttribute('HLASY_2KOLO') ? num(el.getAttribute('HLASY_2KOLO')) : null,
          pct2: num(el.getAttribute('HLASY_PROC_2KOLO')),
          status2: el.getAttribute('ZVOLEN_2KOLO'), // ZVOLEN | NEZVOLEN | null
        });
      } else if (el.localName === 'UCAST') {
        turnout[num(el.getAttribute('KOLO'))] = {
          precinctsTotal: num(el.getAttribute('OKRSKY_CELKEM')),
          precinctsDone: num(el.getAttribute('OKRSKY_ZPRAC')),
          precinctsPct: num(el.getAttribute('OKRSKY_ZPRAC_PROC')),
          voters: num(el.getAttribute('ZAPSANI_VOLICI')),
          turnoutPct: num(el.getAttribute('UCAST_PROC')),
          validVotes: num(el.getAttribute('PLATNE_HLASY')),
        };
      }
    }
    byObvod.set(id, { name: o.getAttribute('NAZEV'), cands, turnout });
  }

  const generated = root.getAttribute('DATUM_CAS_GENEROVANI');
  let anyVotes = false;
  for (const o of byObvod.values()) {
    for (const c of o.cands.values()) if (c.votes1 > 0 || (c.votes2 ?? 0) > 0) anyVotes = true;
  }
  return { generatedAt: generated ? new Date(generated) : null, byObvod, anyVotes };
}

/**
 * Výsledek jednoho obvodu spojený s registrem kandidátů.
 * Kandidáti se párují podle (obvod, pořadové číslo) a kontroluje se příjmení,
 * takže staré nebo cizí XML nikdy nepřiřadí hlasy špatnému člověku.
 */
export function obvodResult(obvod, results) {
  const r = results?.byObvod.get(obvod.id);
  if (!r) return null;

  const rows = [];
  for (const c of obvod.candidates) {
    const x = r.cands.get(c.no);
    if (!x || norm(x.lastName) !== norm(c.lastName)) continue;
    rows.push({ c, ...x });
  }
  if (!rows.length) return null;

  const round = rows.some((x) => (x.votes2 ?? 0) > 0 || x.status2) ? 2 : 1;
  const votesOf = (x) => (round === 2 ? (x.votes2 ?? -1) : x.votes1);
  rows.sort((a, b) => votesOf(b) - votesOf(a) || b.votes1 - a.votes1 || a.c.no - b.c.no);

  const hasVotes = rows.some((x) => x.votes1 > 0 || (x.votes2 ?? 0) > 0);
  const elected = rows.find((x) => x.status2 === 'ZVOLEN') ?? rows.find((x) => x.status1 === 'ZVOLEN') ?? null;
  const advancing = rows.filter((x) => x.status1 === '2.KOLO');
  const t = r.turnout[round] ?? r.turnout[1] ?? null;

  let state = 'none';
  if (elected) state = 'elected';
  else if (round === 1 && advancing.length) state = 'runoff'; // 1. kolo uzavřeno, čeká se na 2. kolo
  else if (hasVotes) state = 'counting';

  return { round, rows, hasVotes, leader: hasVotes ? rows[0] : null, elected, advancing, state, turnout: t };
}

// ---------- pravidelné stahování ----------

/**
 * Poller: zavolá `fetchText`, výsledek parsuje a předá `onData`; stav (načítání / ok / chyba)
 * hlásí přes `onStatus`. Když je záložka skrytá, nestahuje. Po návratu se hned obnoví.
 */
export function createPoller({ fetchText, interval, onData, onStatus, background = false }) {
  let timer = null;
  let running = false;
  let inFlight = false;
  let nextAt = null;

  const schedule = () => {
    clearTimeout(timer);
    if (!running) return;
    nextAt = Date.now() + interval;
    timer = setTimeout(tick, interval);
  };

  async function tick() {
    if (inFlight) return;
    if (document.hidden && !background) {
      nextAt = null;
      return; // obnoví se po návratu na záložku
    }
    inFlight = true;
    onStatus({ state: 'loading', nextAt: null });
    try {
      const results = parseResults(await fetchText());
      onData(results);
      onStatus({ state: 'ok', at: new Date(), generatedAt: results.generatedAt, anyVotes: results.anyVotes });
    } catch (e) {
      onStatus({ state: 'error', at: new Date(), error: e instanceof Error ? e.message : String(e) });
    } finally {
      inFlight = false;
      schedule();
      onStatus({ nextAt });
    }
  }

  const onVisible = () => {
    if (!document.hidden && running && (!nextAt || Date.now() >= nextAt)) tick();
  };

  return {
    start() {
      running = true;
      document.addEventListener('visibilitychange', onVisible);
      tick();
    },
    refresh() {
      clearTimeout(timer);
      return tick();
    },
    stop() {
      running = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    },
  };
}
