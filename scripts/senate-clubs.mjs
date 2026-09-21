// Aktuální složení Senátu z senat.cz: senátorské kluby, senátoři, jejich obvod, strana a konec mandátu.
// Používá se pro křeslový graf. Stránky jsou veřejné HTML, žádné API, takže se čte opatrně (pomalu, po jedné).

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; senat2026-build; +https://github.com/rejcom/senat2026)' };

const strip = (s) =>
  s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

async function get(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} – ${url}`);
  return res.text();
}

/** „Senátorský klub ANO 2011“ → „ANO 2011“ */
const shortClub = (n) =>
  n
    .replace(/^Senátorský klub\s+/i, '')
    .replace(/^Senátoři nezařazení do klubu$/i, 'Nezařazení');

export async function fetchSenate({ log = () => {}, pauseMs = 150 } = {}) {
  const now = new Date();
  const day = `${now.getDate()}.${now.getMonth() + 1}.${now.getFullYear()}`;
  const iso = now.toISOString().slice(0, 10);

  const overview = await get(`https://www.senat.cz/organy/index.php?ke_dni=${day}&O=4&par_1=K`);
  const clubIds = [...new Set([...overview.matchAll(/par_2=(\d+)/g)].map((m) => m[1]))];
  if (!clubIds.length) throw new Error('Na stránce klubů senat.cz jsem nenašel žádné kluby.');

  const clubs = [];
  const members = []; // { pid, clubId }
  for (const id of clubIds) {
    const html = await get(`https://www.senat.cz/organy/index.php?lng=cz&ke_dni=${day}&O=15&par_2=${id}`);
    const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => strip(m[1]));
    const name = h1s.find((t) => /klub|nezařaz/i.test(t)) ?? h1s.at(-1);
    const pids = [...new Set([...html.matchAll(/par_3=(\d+)/g)].map((m) => m[1]))];
    clubs.push({ id, name, short: shortClub(name), size: pids.length });
    for (const pid of pids) members.push({ pid, clubId: id });
    log(`  ${name}: ${pids.length}`);
  }

  const senators = [];
  for (const { pid, clubId } of members) {
    const html = await get(`https://www.senat.cz/senatori/index.php?lng=cz&ke_dni=${day}&O=15&par_3=${pid}`);
    const name = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)]
      .map((m) => strip(m[1]))
      .find((t) => t && !/Senát Parlamentu/.test(t));
    const rows = {};
    for (const m of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<td class="odd">([\s\S]*?)<\/td><td class="even">([\s\S]*?)<\/td>/g)) {
      rows[strip(m[1])] = strip(m[2]);
    }
    const obvod = Number((rows['Obvod'] ?? '').match(/\d+/)?.[0]);
    const elected = (rows['Zvolen za'] ?? '').match(/^(.*?)\s+v roce\s+(\d{4})/);
    const mandate = (rows['Mandát'] ?? '').match(/(\d+)\.(\d+)\.(\d{4})\s*-\s*(\d+)\.(\d+)\.(\d{4})/);
    if (!obvod || !name) throw new Error(`Profil senátora ${pid} se nepodařilo zpracovat (obvod=${obvod}, jméno=${name}).`);
    senators.push({
      pid,
      name,
      clubId,
      obvod,
      electedFor: elected?.[1] ?? null,
      electedYear: elected ? Number(elected[2]) : null,
      mandateEnd: mandate ? `${mandate[6]}-${mandate[5].padStart(2, '0')}-${mandate[4].padStart(2, '0')}` : null,
    });
    await new Promise((r) => setTimeout(r, pauseMs));
  }

  return { asOf: iso, source: `https://www.senat.cz/organy/index.php?ke_dni=${day}&O=4&par_1=K`, clubs, senators };
}
