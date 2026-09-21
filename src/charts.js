// Jednoduché grafy bez knihovny (SVG / HTML), aby se web načítal rychle.
import { esc } from './cards.js';

export const GENDER_COLORS = { F: '#c8508a', M: '#4a7fb5' };

/** Histogram věku, sloupce rozdělené podle pohlaví. */
export function ageChart(el, bins) {
  const w = 520;
  const h = 210;
  const m = { t: 14, r: 8, b: 30, l: 28 };
  const iw = w - m.l - m.r;
  const ih = h - m.t - m.b;
  const maxV = Math.max(...bins.map((b) => b.F + b.M));
  const ymax = Math.ceil(maxV / 5) * 5;
  const bw = iw / bins.length;
  const y = (v) => m.t + ih - (v / ymax) * ih;

  let s = `<svg viewBox="0 0 ${w} ${h}" class="chart" role="img" aria-label="Histogram věku kandidátů podle pohlaví">`;
  for (let v = 0; v <= ymax; v += 5) {
    s += `<line x1="${m.l}" x2="${w - m.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/>`;
    s += `<text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end" class="axis">${v}</text>`;
  }
  bins.forEach((b, i) => {
    const x = m.l + i * bw + bw * 0.14;
    const bwid = bw * 0.72;
    const total = b.F + b.M;
    s += `<g class="bar-g"><title>${b.from}–${b.to} let: ${total} (muži ${b.M}, ženy ${b.F})</title>`;
    s += `<rect x="${x}" y="${y(b.M)}" width="${bwid}" height="${ih - (y(b.M) - m.t)}" fill="${GENDER_COLORS.M}" rx="1.5"/>`;
    s += `<rect x="${x}" y="${y(total)}" width="${bwid}" height="${y(b.M) - y(total)}" fill="${GENDER_COLORS.F}" rx="1.5"/>`;
    if (total) s += `<text x="${x + bwid / 2}" y="${y(total) - 4}" text-anchor="middle" class="val">${total}</text>`;
    s += `</g><text x="${x + bwid / 2}" y="${h - 12}" text-anchor="middle" class="axis">${b.from}–${b.to}</text>`;
  });
  s += '</svg>';
  s += `<div class="chart-legend"><span><i style="background:${GENDER_COLORS.M}"></i>muži</span><span><i style="background:${GENDER_COLORS.F}"></i>ženy</span></div>`;
  el.innerHTML = s;
}

/** Počty kandidátů podle nominující strany; klik vybere / zruší filtr strany. */
export function partyBars(el, counts, { active, onPick }) {
  const max = Math.max(...counts.map((c) => c.count));
  el.innerHTML = counts
    .map(
      (c) => `<button type="button" class="pbar${active === c.key ? ' is-active' : ''}${active && active !== c.key ? ' is-dim' : ''}" data-key="${c.key}"
        title="${esc(c.short)}: ${c.count} kandidátů, z toho žen ${c.women}${c.defending ? `, obhajuje ${c.defending}` : ''}">
        <span class="pbar-name">${esc(c.short)}</span>
        <span class="pbar-track"><i style="width:${(c.count / max) * 100}%;background:${c.color}"></i></span>
        <span class="pbar-n">${c.count}</span>
      </button>`,
    )
    .join('');
  el.querySelectorAll('.pbar').forEach((b) => b.addEventListener('click', () => onPick(b.dataset.key)));
}
