// Křeslový graf Senátu (81 křesel podle klubů). Jako SVG řetězec: totéž kreslí stránku i export do PNG.
import { esc } from './cards.js';
import { CLUB_BY_PARTY } from './config.js';
import { THEMES, t } from './charts.js';

const ROWS = 5;
const CW = 30; // šířka křesla
const CH = 28;
const COL = 38; // rozteč sloupců
const ROW = 36;
const GAP = 16; // mezera mezi kluby

/** Klub, do kterého spadne zvolený kandidát (odhad podle strany). */
export function winnerClub(cand, clubs) {
  const re = CLUB_BY_PARTY[cand.party.key];
  return (re && clubs.find((c) => re.test(c.short))) || clubs.find((c) => /Nezařaz/i.test(c.short)) || null;
}

/**
 * Průběžné složení: pro každé křeslo, které se letos volí, zvolený kandidát a jeho klub.
 * results = Map(obvod -> obvodResult z live.js).
 */
export function liveSeats(senate, results) {
  const m = new Map();
  for (const s of senate.seats) {
    if (!s.inPlay) continue;
    const el = results.get(s.obvod)?.elected;
    m.set(s.obvod, el ? { won: true, club: winnerClub(el.c, senate.clubs), cand: el.c } : { won: false, club: null, cand: null });
  }
  return m;
}

/** Rozdělí křesla do skupin (klub → křesla) pro zvolený pohled. */
function groupSeats(senate, live) {
  if (!live) {
    return senate.clubs.map((club) => ({
      club,
      seats: senate.seats.filter((s) => s.clubId === club.id).map((s) => ({ s, state: s.inPlay ? 'check' : 'plain' })),
    }));
  }
  const groups = senate.clubs.map((club) => ({
    club,
    seats: [
      ...senate.seats.filter((s) => s.clubId === club.id && !s.inPlay).map((s) => ({ s, state: 'plain' })),
      ...senate.seats.filter((s) => s.inPlay && live.get(s.obvod)?.club?.id === club.id).map((s) => ({ s, state: 'won', cand: live.get(s.obvod).cand })),
    ],
  }));
  const pending = senate.seats.filter((s) => s.inPlay && !live.get(s.obvod)?.won).map((s) => ({ s, state: 'pending' }));
  if (pending.length) groups.push({ club: { id: 'pending', short: 'Nerozhodnuto', color: '#a8b0ba' }, seats: pending });
  return groups.filter((g) => g.seats.length);
}

function chair(x, y, { fill, stroke = 'none', check = false, checkColor = '#fff', halo }) {
  const sw = stroke === 'none' ? '' : ` stroke="${stroke}" stroke-width="1.6"`;
  const cut = halo ? ` stroke="${halo}" stroke-width="1.2"` : '';
  let s = `<g transform="translate(${x},${y})">`;
  s += `<rect x="0" y="9" width="8" height="19" rx="3.5" fill="${fill}"${sw || cut}/>`;
  s += `<rect x="22" y="9" width="8" height="19" rx="3.5" fill="${fill}"${sw || cut}/>`;
  s += `<rect x="4" y="15" width="22" height="13" rx="3.5" fill="${fill}"${sw || cut}/>`;
  s += `<rect x="5" y="0" width="20" height="17" rx="6" fill="${fill}"${sw || cut}/>`;
  if (check) s += `<path d="M10.2 8.6 l3.6 3.6 l6.2 -7.4" stroke="${checkColor}" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  return s + '</g>';
}

/**
 * senate = data.senate, live = null (před volbami) nebo Map z liveSeats().
 * Vrací { svg, width, height } – svg je responzivní, width/height jsou rozměry viewBoxu.
 */
export function senateSvg(senate, { theme = 'page', live = null, chairsOnly = false } = {}) {
  const T = THEMES[theme];
  const groups = groupSeats(senate, live);
  const bg = theme === 'export' ? '#ffffff' : 'var(--card)';

  let x = 0;
  let seats = '';
  const legendItems = [];
  for (const g of groups) {
    const cols = Math.ceil(g.seats.length / ROWS);
    g.seats.forEach(({ s, state, cand }, i) => {
      const cx = x + Math.floor(i / ROWS) * COL;
      const cy = (i % ROWS) * ROW;
      const isPending = state === 'pending';
      const who = isPending
        ? `obvod ${s.obvod} ${s.obvodName}: ${s.name} – zatím nerozhodnuto`
        : `obvod ${s.obvod} ${s.obvodName}: ${state === 'won' ? `zvolen(a) ${cand.firstName} ${cand.lastName}` : s.name}`;
      const extra =
        state === 'check'
          ? ` · klub ${g.club.short} · volí se letos${s.running === false ? ' (senátor nekandiduje)' : ''}`
          : state === 'plain'
            ? ` · klub ${g.club.short} · zvolen(a) za ${s.electedFor ?? '?'} ${s.electedYear ?? ''}`
            : '';
      seats += `<g><title>${esc(who + extra)}</title>`;
      seats += isPending
        ? chair(cx, cy, { fill: theme === 'export' ? '#f3f2f1' : 'var(--bg)', stroke: g.club.color, check: false })
        : chair(cx, cy, { fill: g.club.color, check: state === 'check' || state === 'won', halo: bg });
      seats += '</g>';
    });
    const inPlayN = g.seats.filter((q) => q.state === 'check' || q.state === 'won' || q.state === 'pending').length;
    legendItems.push({
      color: g.club.color,
      name: g.club.short,
      size: g.seats.length,
      note: live ? (g.club.id === 'pending' ? 'čeká na výsledek' : `z toho nově zvoleno: ${g.seats.filter((q) => q.state === 'won').length}`) : `v sázce: ${inPlayN}`,
      outline: g.club.id === 'pending',
    });
    x += cols * COL - (COL - CW) + GAP;
  }
  const width = Math.max(x - GAP, 1);
  const chartH = (ROWS - 1) * ROW + CH;

  if (chairsOnly) {
    // jen křesla (legendu si vykreslí volající větším písmem)
    const svg = `<svg viewBox="0 0 ${width} ${chartH + 2}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Složení Senátu podle klubů" style="width:100%;height:auto;display:block">${seats}</svg>`;
    return { svg, width, height: chartH + 2, groups, legendItems };
  }

  // legenda: 3 položky v řadě
  const perRow = 3;
  const itemW = width / perRow;
  let ly = chartH + 34;
  let leg = '';
  legendItems.forEach((it, i) => {
    const lx = (i % perRow) * itemW;
    const yy = ly + Math.floor(i / perRow) * 44;
    leg += it.outline
      ? `<rect x="${lx + 1}" y="${yy - 10}" width="12" height="12" rx="3" fill="none" stroke="${it.color}" stroke-width="1.8"/>`
      : `<rect x="${lx}" y="${yy - 11}" width="14" height="14" rx="3" fill="${it.color}"/>`;
    leg += t(lx + 22, yy, `${esc(it.name)}`, { size: 13, weight: 700, fill: T.ink });
    leg += t(lx + 22, yy + 17, `${it.size} ${it.size === 1 ? 'křeslo' : it.size >= 2 && it.size <= 4 ? 'křesla' : 'křesel'} · ${it.note}`, { size: 12, fill: T.muted });
  });
  const legRows = Math.ceil(legendItems.length / perRow);
  const noteY = ly + (legRows - 1) * 44 + 44;
  // vysvětlivka: křeslo se zatržítkem = mandát, o který se letos volí
  const key = `<g transform="translate(0,${noteY - 16}) scale(.66)">${chair(0, 0, { fill: T.muted, check: true, halo: bg })}</g>`;
  const keyText = live
    ? 'zatržítko = křeslo, o které se letos volilo (zvolený je zařazen do klubu podle strany)'
    : 'zatržítko = křeslo, o které se letos volí';
  const height = noteY + 8;

  const svg =
    `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Složení Senátu podle klubů, 81 křesel" style="width:100%;height:auto;display:block">` +
    seats +
    leg +
    key +
    t(26, noteY - 1, esc(keyText), { size: 12, fill: T.muted }) +
    '</svg>';
  return { svg, width, height, groups, legendItems };
}

/** Vykreslí graf do elementu. */
export function senateChart(el, senate, opts) {
  el.innerHTML = senateSvg(senate, opts).svg;
}
