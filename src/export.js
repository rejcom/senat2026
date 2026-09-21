// Export grafik do PNG 1200×627 (doporučený formát pro LinkedIn), bez knihoven:
// složí SVG (nadpis + grafika + komentář + zdroj), vykreslí ho do canvasu a stáhne jako PNG.
import { esc } from './cards.js';
import { ageSvg, battleSvg, GENDER_COLORS } from './charts.js';
import { ageHistogram, summarize, fmt1 } from './stats.js';
import { fullName } from './data.js';
import { DESC } from './config.js';

const W = 1200;
const H = 627;
const PAD = 40;
const SCALE = 2; // výsledný PNG má 2400×1254 px
const FONT = "font-family:'Segoe UI',system-ui,-apple-system,'Helvetica Neue',Arial,sans-serif";
const INK = '#252423';
const MUTED = '#605e5c';

const txt = (x, y, s, { size = 14, weight = 400, anchor = 'start', fill = INK } = {}) =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" style="${FONT};font-size:${size}px;font-weight:${weight};fill:${fill}">${s}</text>`;

/** Zalomí text na řádky o nejvýš `max` znacích. */
function wrap(text, max) {
  const lines = [];
  let cur = '';
  for (const w of text.split(' ')) {
    if ((cur + ' ' + w).trim().length > max) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}
const para = (x, y, text, max, opts = {}) =>
  wrap(text, max).map((l, i) => txt(x, y + i * (opts.lh ?? 20), esc(l), opts)).join('');
const lines = (text, max) => wrap(text, max).length;

// vložení hotového <svg> do rámečku (odstraní responzivní styl, přidá polohu)
const place = (svg, x, y, w, h) =>
  svg.replace(/ style="width:100%;height:auto;display:block"/, '').replace('<svg ', `<svg x="${x}" y="${y}" width="${w}" height="${h}" `);

/** Stejná pravidla pro mapu jako ve style.css, jen s pevnými světlými barvami. */
const MAP_CSS = `
svg { --map-empty:#dfe3e8; --map-off:#eceae8; }
.obvod { fill:var(--map-empty); stroke:#fff; stroke-width:1; stroke-linejoin:round; }
.obvod--off { fill:var(--map-off); }
.obvod.is-elected { stroke:#d4a017; stroke-width:2; }
.obvod-no { font:700 11px 'Segoe UI',system-ui,Arial,sans-serif; fill:${INK}; paint-order:stroke; stroke:#fff; stroke-width:3px; stroke-linejoin:round; }
.marks--compact .dots { display:none; }
.dot { stroke:#fff; stroke-width:1; }
.dot--defends { stroke:#111; stroke-width:2; }
.dot--dim { opacity:.22; }
.dot--elected { stroke:#d4a017; stroke-width:2.4; }`;

function frame({ title, subtitle, content, note = '', ribbon = '' }) {
  const where = location.host + location.pathname.replace(/index\.html$/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <style>${MAP_CSS}</style>
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  ${
    ribbon
      ? `<rect width="${W}" height="26" fill="#b3261e"/>${txt(W / 2, 18, esc(ribbon), { size: 14, weight: 700, anchor: 'middle', fill: '#fff' })}`
      : ''
  }
  ${txt(PAD, 68, esc(title), { size: 30, weight: 700 })}
  ${txt(PAD, 94, esc(subtitle), { size: 15, fill: MUTED })}
  ${content}
  ${note ? txt(PAD, H - 34, esc(note), { size: 11.5, fill: MUTED }) : ''}
  <line x1="${PAD}" x2="${W - PAD}" y1="${H - 26}" y2="${H - 26}" stroke="#e1dfdd"/>
  ${txt(PAD, H - 9, 'Zdroj: otevřená data ČSÚ (volby.gov.cz) · neoficiální přehled', { size: 12, fill: MUTED })}
  ${txt(W - PAD, H - 9, esc(where), { size: 12, weight: 600, anchor: 'end', fill: MUTED })}
</svg>`;
}

/** Sloupec velkých čísel s popisky vpravo od grafiky. */
function statColumn(items, x, y, width) {
  let out = '';
  let cy = y;
  for (const it of items) {
    const chars = Math.floor((width - 4) / 8.4);
    out += txt(x, cy + 30, esc(it.big), { size: 34, weight: 700, fill: it.color ?? INK });
    const text = para(x, cy + 54, it.text, chars, { size: 14.5, fill: MUTED, lh: 19 });
    out += text;
    cy += 54 + lines(it.text, chars) * 19 + 22;
  }
  return out;
}

const mandates = (n) => `${n} ${n === 1 ? 'mandát' : n >= 2 && n <= 4 ? 'mandáty' : 'mandátů'}`;

// ---------- jednotlivé grafiky ----------

function battleGraphic({ data, battle }) {
  const named = battle.filter((r) => r.key !== 'OTHER' && r.key !== 'IND');
  const heldTotal = battle.reduce((s, r) => s + r.held, 0);
  const defenders = battle.reduce((s, r) => s + r.defenders, 0);
  const notRunning = data.obvody.filter((o) => o.incumbent && !o.incumbent.running).length;
  const topHolder = [...named].sort((a, b) => b.held - a.held)[0];
  const topCand = [...named].sort((a, b) => b.candidates - a.candidates)[0];
  const total = data.candidates.length;

  const body = battleSvg(battle, { theme: 'export' });
  const bh = 466;
  const bw = Math.round((560 / (30 + battle.length * 27 + 52)) * bh);
  const items = [
    { big: `${topHolder.held} z ${heldTotal}`, text: `mandátů v sázce drží ${topHolder.short}, nejvíc ze všech stran.`, color: topHolder.color },
    {
      big: String(topCand.candidates),
      text: `kandidátů má ${topCand.short}, ale drží jen ${mandates(topCand.held)}. ${
        topCand.defenders === 0 ? 'Všichni jsou vyzyvatelé.' : `Vyzyvatelů je ${topCand.challengers}.`
      }`,
      color: topCand.color,
    },
    { big: `${defenders} z ${heldTotal}`, text: `senátorů obhajuje mandát${notRunning ? `, ${notRunning} už nekandiduje` : ''}.` },
  ];
  return {
    title: 'Senát 2026: kdo brání, kdo útočí',
    subtitle: `${heldTotal} mandátů v sázce · ${total} kandidátů v ${data.obvody.length} obvodech`,
    content: place(body, PAD, 108, bw, bh) + statColumn(items, PAD + bw + 60, 118, W - PAD - (PAD + bw + 60)),
    note: `Mandát je přiřazen straně, za kterou byl senátor zvolen (složení Senátu k ${new Date(data.meta.sources.incumbentsAsOf).toLocaleDateString('cs-CZ')}).`,
    file: 'senat2026-kdo-brani-kdo-utoci.png',
  };
}

function ageGraphic({ data }) {
  const s = summarize(data.candidates);
  const names = (g) => g.list.map((c) => fullName(c, { titles: false })).join(', ');
  const bw = 730;
  const bh = Math.round((236 / 520) * bw);
  const items = [
    { big: fmt1(s.meanAge), text: `průměrný věk kandidátů, medián ${fmt1(s.medianAge)} let.` },
    { big: `${s.youngest.age} let`, text: `nejmladší: ${names(s.youngest)}.` },
    { big: `${s.oldest.age} let`, text: `nejstarší: ${names(s.oldest)}.` },
    { big: `${Math.round((s.women / s.count) * 100)} %`, text: `tvoří ženy (${s.women} z ${s.count} kandidátů; pohlaví odvozeno z jmen).`, color: GENDER_COLORS.F },
  ];
  return {
    title: 'Věk kandidátů do Senátu 2026',
    subtitle: `${s.count} kandidátů v ${data.obvody.length} obvodech`,
    content: place(ageSvg(ageHistogram(data.candidates), 'export'), PAD, 132, bw, bh) + statColumn(items, PAD + bw + 40, 112, W - 2 * PAD - bw - 40),
    file: 'senat2026-vek-kandidatu.png',
  };
}

const TITLES = {
  incumbent: 'Senát 2026: kdo obhajuje mandát',
  leader: 'Senát 2026: průběžné výsledky',
  count: 'Senát 2026: počet kandidátů v obvodech',
  age: 'Senát 2026: průměrný věk kandidátů',
};

function mapGraphic({ data, counts, state, map, demo }) {
  const { svg } = map.exportSvg();
  const mw = 790;
  const mh = Math.round((560 / 960) * mw);
  const lx = PAD + mw + 30;
  const lw = W - PAD - lx;
  const chars = Math.floor(lw / 6.7);
  let legend = para(lx, 128, DESC[state.mode], chars, { size: 13, fill: MUTED, lh: 17 });
  let y = 128 + lines(DESC[state.mode], chars) * 17 + 18;

  if (state.mode === 'count' || state.mode === 'age') {
    const vals = data.obvody.map((o) => (state.mode === 'count' ? o.candidates.length : o.candidates.reduce((s, c) => s + c.age, 0) / o.candidates.length));
    const [a, b] = state.mode === 'count' ? ['#dbe9f6', '#1d5fa8'] : ['#e3f1ee', '#0f6b62'];
    const f = state.mode === 'count' ? String : fmt1;
    legend += `<defs><linearGradient id="rampG"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>`;
    legend += `<rect x="${lx}" y="${y}" width="${lw}" height="14" rx="2" fill="url(#rampG)"/>`;
    legend += txt(lx, y + 32, f(Math.min(...vals)), { size: 13, fill: MUTED }) + txt(lx + lw, y + 32, f(Math.max(...vals)), { size: 13, fill: MUTED, anchor: 'end' });
  } else {
    counts.forEach((c, i) => {
      const yy = y + i * 21;
      legend += `<circle cx="${lx + 6}" cy="${yy - 4}" r="5.5" fill="${c.color}"/>`;
      legend += txt(lx + 20, yy, esc(c.short), { size: 13.5, weight: 600 }) + txt(lx + lw, yy, c.count, { size: 13.5, weight: 700, anchor: 'end' });
    });
    y += counts.length * 21 + 12;
    legend += `<circle cx="${lx + 6}" cy="${y - 4}" r="5" fill="none" stroke="#111" stroke-width="2"/>` + txt(lx + 20, y, 'obhajuje mandát', { size: 13, fill: MUTED });
  }

  const s = summarize(data.candidates);
  const results = state.mode === 'leader';
  return {
    title: TITLES[state.mode],
    subtitle: `${data.obvody.length} z 81 obvodů · ${s.count} kandidátů · 1. kolo 9.–10. 10. 2026`,
    content: place(svg.outerHTML.replace(/ style="width:100%;height:auto;display:block"/, ''), PAD, 106, mw, mh) + legend,
    ribbon: demo && results ? 'DEMO – fiktivní data, nejde o skutečné výsledky voleb' : '',
    file: `senat2026-mapa-${state.mode}.png`,
  };
}

// ---------- PNG ----------

async function toPng(svgText) {
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = W * SCALE;
    canvas.height = H * SCALE;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG se nepodařilo vytvořit'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** ctx: { data, counts, battle, state, map, demo }. Vrací { blob, file }; stažení provede volající. */
export async function renderGraphic(kind, ctx) {
  const g = { battle: battleGraphic, age: ageGraphic, map: mapGraphic }[kind](ctx);
  const blob = await toPng(frame(g));
  return { blob, file: g.file };
}

export function download(blob, file) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
