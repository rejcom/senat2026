// Souhrnné statistiky kandidátů (za celou ČR i za jeden obvod).

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function summarize(cands) {
  if (!cands.length) return null;
  const ages = cands.map((c) => c.age);
  const min = Math.min(...ages);
  const max = Math.max(...ages);
  const women = cands.filter((c) => c.gender === 'F').length;
  return {
    count: cands.length,
    women,
    men: cands.length - women,
    meanAge: mean(ages),
    medianAge: median(ages),
    youngest: { age: min, list: cands.filter((c) => c.age === min) },
    oldest: { age: max, list: cands.filter((c) => c.age === max) },
    defending: cands.filter((c) => c.defends).length,
  };
}

/** Počty kandidátů podle strany (klíč = skupina barvy), seřazené sestupně; „Ostatní“ a „Nezávislí“ nakonec. */
export function partyCounts(cands) {
  const m = new Map();
  for (const c of cands) {
    const k = c.party.key;
    const e = m.get(k) ?? { key: k, short: c.party.short, color: c.party.color, count: 0, women: 0, defending: 0 };
    e.count++;
    if (c.gender === 'F') e.women++;
    if (c.defends) e.defending++;
    m.set(k, e);
  }
  const tail = { OTHER: 2, IND: 1 };
  return [...m.values()].sort(
    (a, b) => (tail[a.key] ?? 0) - (tail[b.key] ?? 0) || b.count - a.count || a.short.localeCompare(b.short, 'cs'),
  );
}

/** Histogram věku po 5 letech, rozdělený podle pohlaví. */
export function ageHistogram(cands, step = 5) {
  const lo = Math.floor(Math.min(...cands.map((c) => c.age)) / step) * step;
  const hi = Math.floor(Math.max(...cands.map((c) => c.age)) / step) * step;
  const bins = [];
  for (let a = lo; a <= hi; a += step) bins.push({ from: a, to: a + step - 1, F: 0, M: 0 });
  for (const c of cands) bins[Math.floor((c.age - lo) / step)][c.gender]++;
  return bins;
}

export const fmt1 = (n) => n.toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const fmtInt = (n) => n.toLocaleString('cs-CZ');
