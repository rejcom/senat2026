import { geoMercator, geoPath } from 'd3-geo';
import { select } from 'd3-selection';
import { zoom, zoomIdentity } from 'd3-zoom';
import 'd3-transition';

const W = 960;
const H = 560;
const SVGNS = 'http://www.w3.org/2000/svg';
const PRAGUE_IDS = [21, 22, 23, 24, 25, 26, 27];

const el = (name, attrs = {}, text) => {
  const n = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
};

// lineární míchání dvou barev (#rrggbb) pro souvislé stupnice
function mix(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(a);
  const [r2, g2, b2] = p(b);
  const c = (x, y) => Math.round(x + (y - x) * t);
  return `rgb(${c(r1, r2)},${c(g1, g2)},${c(b1, b2)})`;
}

const RAMP_COUNT = ['#dbe9f6', '#1d5fa8'];
const RAMP_AGE = ['#e3f1ee', '#0f6b62'];

/** Rozmístění teček do mřížky (řádky jsou vystředěné). */
function dotLayout(n, spacing) {
  const cols = n <= 3 ? n : n <= 6 ? 3 : n <= 8 ? 4 : 5;
  const rows = Math.ceil(n / cols);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols);
    const inRow = Math.min(cols, n - r * cols);
    pts.push({ x: (i - r * cols - (inRow - 1) / 2) * spacing, y: r * spacing });
  }
  return { pts, width: (cols - 1) * spacing, height: (rows - 1) * spacing };
}

export function createMap(container, { data, onHover, onLeave, onSelect }) {
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'group', 'aria-label': 'Mapa senátních obvodů' });
  svg.classList.add('map-svg');
  const world = el('g');
  svg.append(world);
  container.append(svg);

  const projection = geoMercator().fitExtent(
    [
      [6, 6],
      [W - 6, H - 6],
    ],
    data.geo,
  );
  const path = geoPath(projection);

  const inactiveLayer = el('g');
  const activeLayer = el('g');
  const marksLayer = el('g', { 'pointer-events': 'none' });
  world.append(inactiveLayer, activeLayer, marksLayer);

  const items = new Map(); // id -> { path, marks, bbox, center, obvod }

  for (const f of data.geo.features) {
    const id = f.properties.id;
    const active = f.properties.active;
    const p = el('path', { d: path(f), class: active ? 'obvod' : 'obvod obvod--off', 'data-id': id });
    (active ? activeLayer : inactiveLayer).append(p);
    const [[x0, y0], [x1, y1]] = path.bounds(f);
    const item = { path: p, bbox: { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 }, active, obvod: data.obvodById.get(id) };
    if (active) {
      const c = path.centroid(f);
      item.center = c;
      item.marks = el('g');
      marksLayer.append(item.marks);
      p.setAttribute('tabindex', '0');
      p.setAttribute('role', 'button');
      p.setAttribute('aria-label', `Obvod ${id} ${item.obvod.name}`);
    }
    items.set(id, item);

    const hover = (e) => e.pointerType !== 'touch' && onHover(id, e, !active);
    p.addEventListener('pointerenter', hover);
    p.addEventListener('pointermove', hover);
    p.addEventListener('pointerleave', () => onLeave(id));
    if (active) {
      p.addEventListener('click', () => onSelect(id, false));
      p.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(id, false);
        }
      });
      p.addEventListener('focus', () => {
        const r = p.getBoundingClientRect();
        onHover(id, { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }, false);
      });
      p.addEventListener('blur', () => onLeave(id));
    }
  }

  // ---------- zoom / posun ----------

  let k = 1;
  const zoomBehavior = zoom()
    .scaleExtent([1, 60])
    .translateExtent([
      [0, 0],
      [W, H],
    ])
    .on('zoom', (e) => {
      world.setAttribute('transform', e.transform.toString());
      k = e.transform.k;
      layoutMarks();
    });
  const sel = select(svg);
  sel.call(zoomBehavior).on('dblclick.zoom', null);

  function zoomTo(ids, { maxK = 14 } = {}) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const id of ids) {
      const b = items.get(id)?.bbox;
      if (!b) continue;
      x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0);
      x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
    }
    if (!isFinite(x0)) return;
    const scale = Math.min(maxK, 0.72 / Math.max((x1 - x0) / W, (y1 - y0) / H));
    const t = zoomIdentity
      .translate(W / 2, H / 2)
      .scale(scale)
      .translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    sel.transition().duration(600).call(zoomBehavior.transform, t);
  }

  const zoomBy = (f) => sel.transition().duration(250).call(zoomBehavior.scaleBy, f);
  const reset = () => sel.transition().duration(500).call(zoomBehavior.transform, zoomIdentity);

  // ---------- značky (číslo obvodu + tečky kandidátů) ----------

  const DOT_R = 4.4;
  const DOT_SP = 11;

  function layoutMarks() {
    for (const it of items.values()) {
      if (!it.active) continue;
      const px = Math.min(it.bbox.w, it.bbox.h) * k; // nejmenší rozměr obvodu v pixelech
      const need = it.dotsWidth + 14;
      it.marks.style.display = px < 15 ? 'none' : '';
      it.marks.setAttribute('transform', `translate(${it.center[0]},${it.center[1]}) scale(${1 / k})`);
      it.marks.classList.toggle('marks--compact', px < Math.max(need, 34));
    }
  }

  // ---------- vykreslení stavu ----------

  const neutral = 'var(--map-empty)';

  /**
   * state: { mode, results: Map(id -> obvodResult), partyFilter, selected }
   */
  function update(state) {
    const counts = data.obvody.map((o) => o.candidates.length);
    const ages = data.obvody.map((o) => o.candidates.reduce((s, c) => s + c.age, 0) / o.candidates.length);
    const lo = (a) => Math.min(...a);
    const hi = (a) => Math.max(...a);

    for (const it of items.values()) {
      if (!it.active) continue;
      const o = it.obvod;
      const res = state.results?.get(o.id) ?? null;
      let fill = neutral;
      let opacity = 1;

      if (state.mode === 'incumbent') {
        if (o.incumbent) {
          fill = o.incumbent.party.color;
          opacity = 0.62;
        }
      } else if (state.mode === 'leader') {
        const w = res?.elected ?? res?.leader;
        if (w) {
          fill = w.c.party.color;
          opacity = res.elected ? 0.95 : 0.6;
        }
      } else if (state.mode === 'count') {
        const t = (o.candidates.length - lo(counts)) / Math.max(1, hi(counts) - lo(counts));
        fill = mix(RAMP_COUNT[0], RAMP_COUNT[1], t);
      } else if (state.mode === 'age') {
        const mean = o.candidates.reduce((s, c) => s + c.age, 0) / o.candidates.length;
        const t = (mean - lo(ages)) / Math.max(0.01, hi(ages) - lo(ages));
        fill = mix(RAMP_AGE[0], RAMP_AGE[1], t);
      }
      it.path.style.fill = fill;
      it.path.style.fillOpacity = opacity;
      it.path.classList.toggle('is-selected', state.selected === o.id);
      it.path.classList.toggle('is-elected', !!res?.elected && state.mode === 'leader');

      // tečky kandidátů
      it.marks.replaceChildren();
      const n = o.candidates.length;
      const { pts, width, height } = dotLayout(n, DOT_SP);
      it.dotsWidth = width + 2 * DOT_R;
      const totalH = 13 + height + 2 * DOT_R + 4;
      const top = -totalH / 2;
      const g = el('g');
      g.append(el('text', { class: 'obvod-no', x: 0, y: top + 10, 'text-anchor': 'middle' }, String(o.id)));
      const dots = el('g', { class: 'dots' });
      o.candidates.forEach((c, i) => {
        const dim =
          (state.partyFilter && c.party.key !== state.partyFilter) ||
          (res && res.state !== 'counting' && res.advancing.length && res.round === 1 && !res.advancing.some((a) => a.c === c)) ||
          (res?.elected && res.elected.c !== c);
        const dot = el('circle', {
          cx: pts[i].x,
          cy: top + 13 + DOT_R + 4 + pts[i].y,
          r: c.defends ? DOT_R + 0.6 : DOT_R,
          fill: c.party.color,
          class: 'dot' + (c.defends ? ' dot--defends' : '') + (dim ? ' dot--dim' : '') + (res?.elected?.c === c ? ' dot--elected' : ''),
        });
        dots.append(dot);
      });
      g.append(dots);
      it.marks.append(g);
    }
    layoutMarks();
  }

  function setHover(id) {
    for (const [i, it] of items) if (it.active) it.path.classList.toggle('is-hover', i === id);
  }

  /**
   * Kopie mapy pro export do obrázku: celá ČR (bez zoomu a bez hover/výběru), značky přepočtené pro k = 1.
   * Styly řeší export.js, tady se řeší jen geometrie.
   */
  function exportSvg() {
    const clone = svg.cloneNode(true);
    clone.removeAttribute('class');
    clone.removeAttribute('role');
    clone.removeAttribute('aria-label');
    const cw = clone.firstChild;
    cw.removeAttribute('transform');
    clone.querySelectorAll('[tabindex]').forEach((n) => {
      n.removeAttribute('tabindex');
      n.removeAttribute('role');
      n.removeAttribute('aria-label');
    });
    clone.querySelectorAll('.is-hover,.is-selected').forEach((n) => n.classList.remove('is-hover', 'is-selected'));
    const markGroups = [...cw.children[2].children];
    let i = 0;
    for (const it of items.values()) {
      if (!it.active) continue;
      const g = markGroups[i++];
      const px = Math.min(it.bbox.w, it.bbox.h);
      g.setAttribute('transform', `translate(${it.center[0]},${it.center[1]})`);
      g.style.display = px < 15 ? 'none' : '';
      g.classList.toggle('marks--compact', px < Math.max(it.dotsWidth + 14, 34));
    }
    return { svg: clone, width: W, height: H };
  }

  return { update, setHover, zoomTo, zoomBy, reset, exportSvg, pragueIds: PRAGUE_IDS, element: svg };
}
