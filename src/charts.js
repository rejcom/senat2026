// Grafy jako SVG řetězce: stejný kód kreslí graf na stránce (theme 'page', barvy z CSS proměnných)
// i do exportovaného obrázku (theme 'export', pevné světlé barvy).
import { esc } from './cards.js';

export const GENDER_COLORS = { F: '#c8508a', M: '#4a7fb5' };

const THEMES = {
  page: { ink: 'var(--ink)', muted: 'var(--muted)', line: 'var(--line)', box: 'var(--bg)' },
  export: { ink: '#252423', muted: '#605e5c', line: '#e1dfdd', box: '#f3f2f1' },
};
const FONT = "font-family:'Segoe UI',system-ui,-apple-system,'Helvetica Neue',Arial,sans-serif";
const t = (x, y, s, { size = 11, weight = 400, anchor = 'start', fill, extra = '' }) =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" style="${FONT};font-size:${size}px;font-weight:${weight};fill:${fill}"${extra}>${s}</text>`;

// ---------- histogram věku ----------

export function ageSvg(bins, theme = 'page') {
  const T = THEMES[theme];
  const w = 520;
  const h = 236;
  const m = { t: 14, r: 8, b: 52, l: 28 };
  const iw = w - m.l - m.r;
  const ih = h - m.t - m.b;
  const maxV = Math.max(...bins.map((b) => b.F + b.M));
  const ymax = Math.ceil(maxV / 5) * 5;
  const bw = iw / bins.length;
  const y = (v) => m.t + ih - (v / ymax) * ih;

  let s = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Histogram věku kandidátů podle pohlaví" style="width:100%;height:auto;display:block">`;
  for (let v = 0; v <= ymax; v += 5) {
    s += `<line x1="${m.l}" x2="${w - m.r}" y1="${y(v)}" y2="${y(v)}" style="stroke:${T.line};stroke-width:1"/>`;
    s += t(m.l - 6, y(v) + 4, v, { anchor: 'end', fill: T.muted });
  }
  bins.forEach((b, i) => {
    const x = m.l + i * bw + bw * 0.14;
    const bwid = bw * 0.72;
    const total = b.F + b.M;
    s += `<g><title>${b.from}–${b.to} let: ${total} (muži ${b.M}, ženy ${b.F})</title>`;
    s += `<rect x="${x}" y="${y(b.M)}" width="${bwid}" height="${ih - (y(b.M) - m.t)}" fill="${GENDER_COLORS.M}" rx="1.5"/>`;
    s += `<rect x="${x}" y="${y(total)}" width="${bwid}" height="${y(b.M) - y(total)}" fill="${GENDER_COLORS.F}" rx="1.5"/>`;
    if (total) s += t(x + bwid / 2, y(total) - 4, total, { anchor: 'middle', weight: 600, fill: T.ink });
    s += `</g>` + t(x + bwid / 2, m.t + ih + 16, `${b.from}–${b.to}`, { anchor: 'middle', fill: T.muted });
  });
  const ly = h - 12;
  s += `<rect x="${w / 2 - 60}" y="${ly - 9}" width="10" height="10" rx="2" fill="${GENDER_COLORS.M}"/>` + t(w / 2 - 46, ly, 'muži', { size: 12, fill: T.muted });
  s += `<rect x="${w / 2 + 10}" y="${ly - 9}" width="10" height="10" rx="2" fill="${GENDER_COLORS.F}"/>` + t(w / 2 + 24, ly, 'ženy', { size: 12, fill: T.muted });
  return s + '</svg>';
}

export function ageChart(el, bins) {
  el.innerHTML = ageSvg(bins);
}

// ---------- kdo brání, kdo útočí ----------

const ROW = 27;
const TOP = 30;

/** rows = battleRows(); active = klíč vybrané strany (ostatní se zeslabí). */
export function battleSvg(rows, { theme = 'page', active = null } = {}) {
  const T = THEMES[theme];
  const w = 560;
  const maxCand = Math.max(...rows.map((r) => r.candidates));
  const barX = 300;
  const scale = 232 / maxCand;
  const h = TOP + rows.length * ROW + 52;

  let s = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Kolik mandátů strany drží a kolik mají kandidátů: obhájci a vyzyvatelé" style="width:100%;height:auto;display:block">`;
  s += t(0, 14, 'Strana', { fill: T.muted });
  s += t(126, 14, 'Drží mandátů (z 27)', { fill: T.muted });
  s += t(barX, 14, 'Kandidátů', { fill: T.muted });
  s += `<line x1="0" x2="${w}" y1="${TOP - 8}" y2="${TOP - 8}" style="stroke:${T.line}"/>`;

  rows.forEach((r, i) => {
    const cy = TOP + i * ROW + ROW / 2;
    const dim = active && active !== r.key;
    const label = r.key === 'OTHER' ? 'Ostatní strany' : r.short;
    const tip = `${label}: drží ${r.held} z 27 mandátů (senátor znovu kandiduje za stranu u ${r.heldAgain}); kandidátů ${r.candidates} – obhajuje ${r.defenders}, vyzyvatelů ${r.challengers}`;
    s += `<g data-key="${r.key}" style="cursor:pointer${dim ? ';opacity:.35' : ''}"><title>${esc(tip)}</title>`;
    s += `<rect x="-4" y="${cy - ROW / 2}" width="${w + 8}" height="${ROW}" fill="transparent"/>`;
    s += `<circle cx="6" cy="${cy}" r="5" fill="${r.color}"/>` + t(18, cy + 4, esc(label), { size: 12.5, weight: 600, fill: T.ink });

    // držené mandáty jako čtverečky: plný = senátor znovu kandiduje za stranu, obrys = ne
    const sq = Math.min(13, 158 / Math.max(1, r.held) - 3);
    for (let k = 0; k < r.held; k++) {
      const x = 126 + k * (sq + 3);
      s += k < r.heldAgain
        ? `<rect x="${x}" y="${cy - sq / 2}" width="${sq}" height="${sq}" rx="2" fill="${r.color}"/>`
        : `<rect x="${x + 0.75}" y="${cy - sq / 2 + 0.75}" width="${sq - 1.5}" height="${sq - 1.5}" rx="2" fill="none" stroke="${r.color}" stroke-width="1.5"/>`;
    }
    if (!r.held) s += t(126, cy + 4, '–', { fill: T.muted });

    // kandidáti: plná část = obhajuje mandát, světlá = vyzyvatelé
    const dW = r.defenders * scale;
    const cW = r.challengers * scale;
    if (dW) s += `<rect x="${barX}" y="${cy - 7}" width="${dW}" height="14" rx="2" fill="${r.color}"/>`;
    if (cW) s += `<rect x="${barX + dW}" y="${cy - 7}" width="${cW}" height="14" rx="2" fill="${r.color}" fill-opacity=".38"/>`;
    s += t(barX + dW + cW + 7, cy + 4.5, r.candidates, { size: 12.5, weight: 700, fill: T.ink });
    s += '</g>';
  });

  // legenda
  const ly = TOP + rows.length * ROW + 14;
  s += `<rect x="0" y="${ly - 9}" width="11" height="11" rx="2" fill="${T.muted}"/>` + t(16, ly, 'senátor znovu kandiduje za stranu', { fill: T.muted });
  s += `<rect x="216" y="${ly - 8.25}" width="9.5" height="9.5" rx="2" fill="none" stroke="${T.muted}" stroke-width="1.5"/>` + t(231, ly, 'mandát drží, ale za stranu nekandiduje', { fill: T.muted });
  const ly2 = ly + 20;
  s += `<rect x="0" y="${ly2 - 9}" width="22" height="11" rx="2" fill="${T.muted}"/>` + t(28, ly2, 'obhajuje mandát', { fill: T.muted });
  s += `<rect x="128" y="${ly2 - 9}" width="22" height="11" rx="2" fill="${T.muted}" fill-opacity=".38"/>` + t(156, ly2, 'vyzyvatel', { fill: T.muted });
  return s + '</svg>';
}

/** Vykreslí graf a zpřístupní kliknutí na řádek strany (filtr). */
export function battleChart(el, rows, { active, onPick }) {
  el.innerHTML = battleSvg(rows, { active });
  el.querySelectorAll('[data-key]').forEach((g) => g.addEventListener('click', () => onPick(g.dataset.key)));
}
