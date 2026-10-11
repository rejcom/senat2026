// DEMO 2. kola: vymyšlené okrskové dávky ve formátu ČSÚ (K2) pro zkoušku predikce a vysílání. Žádná skutečná data.
// Výsledek každého okrsku se vygeneruje z jeho výsledku v 1. kole podle předpisu podobného modelu predikce (s vlastními náhodnými
// parametry obvodu), takže predikce má co „objevovat“. Pořadí sčítání: menší okrsky dřív (jako ve skutečnosti).

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r() || 1e-9)) * Math.cos(2 * Math.PI * r());
const expit = (x) => 1 / (1 + Math.exp(-x));
const logit = (p) => Math.log(p / (1 - p));

/**
 * @param k1Map Map(obvod → [{ id, R, N1, v1 }]) (indexK1)
 * @param pairs Map(obvod → [A, B]) – dvojice kandidátů ve 2. kole
 * @param opts { chunk: okrsků v dávce, seed, startedAt, minutes: za kolik minut se „sečte“ všechno }
 * @returns { fetchBatch(n) } – vrací XML dávky, nebo null, když ještě „neexistuje“
 */
export function createDemoK2(k1Map, pairs, { chunk = 40, seed = 7, startedAt = Date.now(), minutes = 5 } = {}) {
  const r = rng(seed);
  const items = [];
  for (const [obvod, [A, B]] of pairs) {
    const prec = k1Map.get(obvod);
    if (!prec) continue;
    const meanLogR = prec.reduce((s, p) => s + Math.log(p.R), 0) / prec.length;
    const th = [0.15 + 0.4 * gauss(r), 0.7, -0.15 + 0.9 * gauss(r), 0.07 * gauss(r)];
    const delta = -0.77 + 0.2 * gauss(r);
    for (const p of prec) {
      const a = p.v1[A] ?? 0;
      const b = p.v1[B] ?? 0;
      const sigma = (a + 0.5) / (a + b + 1);
      const other = Math.max(0, (p.N1 - a - b) / p.N1);
      const z = Math.log(p.R) - meanLogR;
      const mu = expit(th[0] + th[1] * logit(Math.min(0.99, Math.max(0.01, sigma))) + th[2] * other + th[3] * z + 0.25 * gauss(r));
      const V = Math.max(1, Math.round(p.N1 * Math.exp(delta + 0.23 * gauss(r))));
      const A2 = Math.min(V, Math.max(0, Math.round(V * mu + Math.sqrt(V * mu * (1 - mu) * 1.5) * gauss(r))));
      items.push({ obvod, A, B, A2, B2: V - A2, V, id: p.id, key: Math.log(p.R) + 0.6 * gauss(r) });
    }
  }
  items.sort((x, y) => x.key - y.key);
  items.forEach((it, i) => (it.order = i + 1));
  const batches = [];
  for (let i = 0; i < items.length; i += chunk) batches.push(items.slice(i, i + chunk));

  const revealed = () => Math.min(batches.length, Math.floor(((Date.now() - startedAt) / (minutes * 60_000)) * batches.length) + 1);

  async function fetchBatch(n) {
    if (n < 1 || n > revealed()) return null;
    const rows = batches[n - 1]
      .map((it) => {
        const [obec, okrsek] = it.id.split('-');
        return `<OKRSEK CIS_OBEC="${obec}" CIS_OKRSEK="${okrsek}" CIS_OBVOD="${it.obvod}" PORADI_ZPRAC="${it.order}" OPAKOVANE="0">
<UCAST_OKRSEK PLATNE_HLASY="${it.V}"/>
<HLASY_OKRSEK PORADOVE_CISLO="${it.A}" HLASY="${it.A2}"/>
<HLASY_OKRSEK PORADOVE_CISLO="${it.B}" HLASY="${it.B2}"/>
</OKRSEK>`;
      })
      .join('\n');
    return `<?xml version="1.0"?><VYSLEDKY_OKRSKY><DAVKA KOLO="2" PORADI_DAVKY="${n}"/>\n${rows}\n</VYSLEDKY_OKRSKY>`;
  }

  /** Skutečný (vymyšlený) konečný podíl A v obvodu – jen pro kontrolu demo. */
  function truth(obvod) {
    let a = 0;
    let b = 0;
    for (const it of items) if (it.obvod === obvod) {
      a += it.A2;
      b += it.B2;
    }
    return a / (a + b);
  }
  return { fetchBatch, truth, batches: batches.length };
}
