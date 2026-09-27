// Živé výsledky voleb do zastupitelstev (komunální volby 2026) přímo z ČSÚ, po jednotlivých městech.
// Stejný princip jako src/live.js pro Senát: adresa je stálá, mění se jen obsah XML na serveru ČSÚ.

const attr = (tag, k) => (tag.match(new RegExp(`${k}="([^"]*)"`)) || [])[1];
const xmlUnescape = (s) =>
  s == null ? s : s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Načte a rozparsuje výsledky jednoho zastupitelstva (KODZASTUP) z appdata ČSÚ. */
export async function fetchKvResult(resultsBase, kodzastup) {
  const url = `${resultsBase}vysledky_obec_${kodzastup}.xml`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return parseKvResult(await res.text());
}

export function parseKvResult(xml) {
  const obecTag = xml.match(/<OBEC ([^>]*)>/)?.[1] ?? '';
  const jeSpocteno = attr(obecTag, 'JE_SPOCTENO') === '1';
  const ucastTag = xml.match(/<UCAST ([^>]*)\/>/)?.[1] ?? '';
  const ucast = {
    okrskyCelkem: +attr(ucastTag, 'OKRSKY_CELKEM'),
    okrskyZprac: +attr(ucastTag, 'OKRSKY_ZPRAC'),
    okrskyZpracProc: +attr(ucastTag, 'OKRSKY_ZPRAC_PROC'),
    ucastProc: +attr(ucastTag, 'UCAST_PROC'),
    platneHlasy: +attr(ucastTag, 'PLATNE_HLASY'),
  };
  const listiny = [...xml.matchAll(/<VOLEBNI_STRANA ([^>]*)\/>/g)].map((m) => ({
    ostrana: attr(m[1], 'VSTRANA'),
    poradi: +attr(m[1], 'POR_STR_HLAS_LIST'),
    nazev: xmlUnescape(attr(m[1], 'NAZEV_STRANY')),
    hlasy: +attr(m[1], 'HLASY'),
    hlasyProc: +attr(m[1], 'HLASY_PROC'),
    kandidatuPocet: +attr(m[1], 'KANDIDATU_POCET'),
    zastupitelePocet: +attr(m[1], 'ZASTUPITELE_POCET'),
    zastupiteleProc: +attr(m[1], 'ZASTUPITELE_PROC'),
  }));
  return { jeSpocteno, ucast, listiny };
}

/** Pravidelně obnovuje výsledky pro dané město; onUpdate dostane výsledek nebo null při chybě. */
export function pollKvResult(resultsBase, kodzastup, onUpdate, intervalMs = 60_000) {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      onUpdate(await fetchKvResult(resultsBase, kodzastup));
    } catch {
      onUpdate(null);
    }
  };
  tick();
  const id = setInterval(tick, intervalMs);
  return () => {
    stopped = true;
    clearInterval(id);
  };
}
