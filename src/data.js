import { PARTY_COLORS, IND_ID, IND_COLOR, OTHER_COLOR } from './config.js';

// ČSSD a Sociální demokracie sdílejí barvu i řádek v legendě
const PARTY_GROUP = { 759: '7' };
const GROUP_LABEL = { 7: 'ČSSD / Soc. dem.' };

/** Barva a štítek strany podle ID nominující strany. */
export function partyStyle(partyId, parties) {
  const id = String(partyId);
  const group = PARTY_GROUP[id] ?? id;
  const short = GROUP_LABEL[group] ?? parties[id]?.short ?? id;
  const name = parties[id]?.name ?? short;
  if (PARTY_COLORS[group]) return { key: group, color: PARTY_COLORS[group], short, name };
  if (id === IND_ID) return { key: 'IND', color: IND_COLOR, short: 'Nezávislí', name: 'Nezávislý kandidát' };
  return { key: 'OTHER', color: OTHER_COLOR, short: 'Ostatní', name, own: short };
}

export function fullName(p, { titles = true } = {}) {
  const core = `${p.firstName} ${p.lastName}`;
  if (!titles) return core;
  return `${p.titlesBefore ? p.titlesBefore + ' ' : ''}${core}${p.titlesAfter ? ', ' + p.titlesAfter : ''}`;
}

export async function loadData() {
  const base = import.meta.env.BASE_URL;
  const [cand, geo] = await Promise.all([
    fetch(`${base}data/candidates.json`).then((r) => r.json()),
    fetch(`${base}data/obvody.geojson`).then((r) => r.json()),
  ]);

  const candidates = [];
  for (const o of cand.obvody) {
    for (const c of o.candidates) {
      c.uid = `${o.id}-${c.no}`;
      c.obvodName = o.name;
      c.party = partyStyle(c.partyId, cand.parties);
      candidates.push(c);
    }
    if (o.incumbent) o.incumbent.party = partyStyle(o.incumbent.partyId, cand.parties);
  }
  for (const o of cand.others) o.senator.party = partyStyle(o.senator.partyId, cand.parties);

  return {
    meta: cand,
    parties: cand.parties,
    obvody: cand.obvody,
    obvodById: new Map(cand.obvody.map((o) => [o.id, o])),
    othersById: new Map(cand.others.map((o) => [o.id, o])),
    candidates,
    geo,
  };
}
