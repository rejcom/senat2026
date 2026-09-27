// Malá mapka: poloha sledovaných měst v rámci ČR, přiblížená na Plzeňský kraj.
// Podklad (obrys obvodů) je stejný soubor jako u senátní mapy (public/data/obvody.geojson) – slouží
// jen jako orientační pozadí, kandidátní listiny na komunální úrovni s ním nijak nesouvisí.

import { geoMercator, geoPath } from 'd3-geo';

const SVGNS = 'http://www.w3.org/2000/svg';
const el = (name, attrs = {}) => {
  const n = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

// Souřadnice měst (přibližný střed) a směr popisku – Klatovy/Domažlice/Nýrsko leží blízko sebe,
// proto mají popisky ručně rozmístěné, aby se nepřekrývaly. Nesouvisí s daty ČSÚ.
const CITY_COORDS = {
  Plzeň: { lonLat: [13.3776, 49.7384], label: 'right' },
  Klatovy: { lonLat: [13.2947, 49.3958], label: 'right' },
  Domažlice: { lonLat: [12.9310, 49.4407], label: 'left' },
  Nýrsko: { lonLat: [13.1611, 49.2966], label: 'bottom' },
};

const FULL_W = 700;
const FULL_H = 460;

/**
 * Vykreslí mapu do daného <svg>. `mesta` = data.mesta (z kv-candidates.json), `onPick(i)` se zavolá
 * po kliknutí na město. Vrací funkci update(colorForCity) pro překreslení teček podle výsledků.
 */
export function initKvMap(svg, geo, mesta, onPick) {
  const world = el('g');
  svg.append(world);

  const projection = geoMercator().fitExtent(
    [
      [6, 6],
      [FULL_W - 6, FULL_H - 6],
    ],
    geo,
  );
  const path = geoPath(projection);

  for (const f of geo.features) {
    world.append(el('path', { d: path(f), class: 'kv-map-base' }));
  }

  // Přiblížení na obdélník kolem sledovaných měst (stejná projekce, jen jiný výřez).
  const pts = Object.values(CITY_COORDS).map((c) => projection(c.lonLat));
  const pad = 110;
  const x0 = Math.min(...pts.map((p) => p[0])) - pad;
  const x1 = Math.max(...pts.map((p) => p[0])) + pad;
  const y0 = Math.min(...pts.map((p) => p[1])) - pad;
  const y1 = Math.max(...pts.map((p) => p[1])) + pad;
  svg.setAttribute('viewBox', `${x0} ${y0} ${x1 - x0} ${y1 - y0}`);

  const LABEL_POS = {
    right: (x, y) => ({ x: x + 14, y: y + 4, anchor: 'start' }),
    left: (x, y) => ({ x: x - 14, y: y + 4, anchor: 'end' }),
    bottom: (x, y) => ({ x, y: y + 22, anchor: 'middle' }),
  };

  const markers = new Map();
  mesta.forEach((m, i) => {
    const coord = CITY_COORDS[m.nazev];
    if (!coord) return;
    const [x, y] = projection(coord.lonLat);
    const g = el('g', { class: 'kv-map-city', tabindex: '0', role: 'button', 'aria-label': m.nazev });
    const dot = el('circle', { cx: x, cy: y, r: 9 });
    const lp = LABEL_POS[coord.label](x, y);
    const label = el('text', { x: lp.x, y: lp.y, 'text-anchor': lp.anchor });
    label.textContent = m.nazev;
    g.append(dot, label);
    g.addEventListener('click', () => onPick(i));
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') onPick(i);
    });
    world.append(g);
    markers.set(i, dot);
  });

  return function update(colorForCity) {
    for (const [i, dot] of markers) dot.setAttribute('fill', colorForCity(i) ?? 'var(--muted)');
  };
}
