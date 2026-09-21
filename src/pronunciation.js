// Jak se názvy stran čtou nahlas ve vysílání. ÚPRAVY: stačí přepsat řádek níže (klíč = zkratka strany z dat ČSÚ),
// výslovnost si poslechnete na stránce vyslovnost.html.
//
// Jistota jednotlivých záznamů (pole `how`):
//   ujc     – doloženo Internetovou jazykovou příručkou ÚJČ (ODS = [ó dé es])
//   pravidlo – iniciálová zkratka čtená po písmenech podle pravidla ÚJČ (domácí zkratky se čtou hláskovacím způsobem)
//   uzus    – ustálené zvykové čtení (zkratkové slovo ANO, STAN; TOP 09 = „top nula devět“), v příručce výslovně nevyjmenované
//   slovo   – běžné slovo, čte se, jak je napsáno
//   nazev   – zkratka nemá ustálenou výslovnost, čte se celý oficiální název (bezpečná volba)
//   odhad   – nejistý případ, zkontrolujte poslechem
//   potvrzeno – výslovnost ověřil rodilý mluvčí (zadavatel), např. TOP 09 = „top nula devět“, SEN 21 = „sen dvacet jedna“
//
// Písmena se zapisují foneticky (ó dé es), protože hlasový engine by „O D S“ mohl přečíst jako slova „o“, „s“.

export const SPOKEN = {
  // ---- po písmenech ----
  ODS: { say: 'ó dé es', how: 'ujc', parl: 'Senát, Sněmovna' },
  SPD: { say: 'es pé dé', how: 'pravidlo', parl: 'Sněmovna' },
  KSČM: { say: 'ká es čé em', how: 'pravidlo' },
  ČSSD: { say: 'čé es es dé', how: 'pravidlo' },
  'KDU-ČSL': { say: 'ká dé ú čé es el', how: 'pravidlo', parl: 'Senát, Sněmovna' },

  // ---- zkratková slova a ustálené názvy ----
  ANO: { say: 'ano', how: 'uzus', parl: 'Senát, Sněmovna' },
  STAN: { say: 'stan', how: 'uzus', parl: 'Senát, Sněmovna' },
  'TOP 09': { say: 'top nula devět', how: 'potvrzeno', parl: 'Senát, Sněmovna' },
  'SEN 21': { say: 'sen dvacet jedna', how: 'potvrzeno', parl: 'Senát' },

  // ---- běžná slova ----
  Piráti: { say: 'Piráti', how: 'slovo', parl: 'Senát, Sněmovna' },
  Zelení: { say: 'Zelení', how: 'slovo' },
  Levice: { say: 'Levice', how: 'slovo' },
  Svobodní: { say: 'Svobodní', how: 'slovo', parl: 'Senát' },
  Volt: { say: 'Volt', how: 'slovo' },
  Kruh: { say: 'Kruh', how: 'slovo' },
  PŘÍSAHA: { say: 'Přísaha', how: 'slovo', parl: 'Senát' },
  'Stačilo!': { say: 'Stačilo', how: 'slovo' },
  NEZLOMNÍ: { say: 'Nezlomní', how: 'slovo' },
  Generace: { say: 'Generace', how: 'slovo' },
  Ostravak: { say: 'Ostravak', how: 'slovo' },
  Evo: { say: 'Revoluce', how: 'slovo' }, // oficiální název „rEvoluce“
  PRO: { say: 'pro', how: 'odhad' }, // „PRO Právo Respekt Odbornost“
  ReMeK: { say: 'Remek', how: 'odhad' },

  // ---- bez ustálené výslovnosti: celý název ----
  NK: { say: 'nezávislý kandidát', how: 'nazev', screen: 'nezávislý kandidát', parl: 'Senát' },
  SOCDEM: { say: 'Sociální demokracie', how: 'nazev', screen: 'Sociální demokracie', parl: 'Senát' },
  'Švýcarská dem.': { say: 'Švýcarská demokracie', how: 'nazev', screen: 'Švýcarská demokracie' },
  JaSaN: { say: 'Jasný signál nezávislých', how: 'nazev' },
  NČ: { say: 'Naše Česko', how: 'nazev' },
  'SD-SN': { say: 'Spojení demokraté, Sdružení nezávislých', how: 'nazev' },
  ČSNS: { say: 'Česká strana národně sociální', how: 'nazev' },
  'MÍSTNÍ HNHRM': { say: 'Místní hnutí za harmonický rozvoj obcí a měst', how: 'nazev' },
  SLK: { say: 'Starostové pro Liberecký kraj', how: 'nazev', parl: 'Senát' },
  NMFM: { say: 'Naše město Frýdek-Místek', how: 'nazev' },
  'ZVUK 12': { say: 'Zvuk dvanáct', how: 'nazev' },
  'PRO PLZEŇ': { say: 'Pro Plzeň', how: 'nazev' },
  VOK: { say: 'Volba pro kraj', how: 'nazev' },
  'JsmePRO!': { say: 'Jsme pro', how: 'nazev' },
  APB: { say: 'Aliance pro budoucnost', how: 'nazev' },
  'PRAHA SOBĚ': { say: 'Praha sobě', how: 'nazev' },
  TEAM: { say: 'Jsme team', how: 'odhad' },
  SMS: { say: 'Sdružení pro místní správu', how: 'nazev' },
  RH: { say: 'Rozvíjíme Hradec', how: 'nazev' },
  OK: { say: 'Osobnosti pro kraj', how: 'nazev' },
  ČZS: { say: 'Česká zemědělská strana', how: 'nazev' },
  GEN: { say: 'Gen', how: 'odhad' },
  VÝZVA: { say: 'Výzva dva tisíce dvacet pět', how: 'nazev' },
  HR: { say: 'Hlas regionů', how: 'nazev' },
  HOČ: { say: 'Odvážné Česko', how: 'nazev' },
  HSR: { say: 'Srdcem a rozumem', how: 'nazev' },
  '24/7': { say: 'dvacet čtyři sedm', how: 'nazev' },
  HDK: { say: 'Hradecký demokratický klub', how: 'nazev', parl: 'Senát' },
};

/** Jak název strany napsat na obrazovku v komentáři. */
export function screenName(party) {
  if (party.key === 'IND') return 'nezávislý kandidát';
  return SPOKEN[party.raw]?.screen ?? party.raw ?? party.short;
}

/**
 * Jak název strany přečíst nahlas. Co není ve slovníku:
 * celý oficiální název, je-li rozumně krátký, jinak zkratka (a v testu se to ukáže jako nedoplněné).
 */
export function speechName(party) {
  if (party.key === 'IND') return 'nezávislý kandidát';
  const hit = SPOKEN[party.raw];
  if (hit) return hit.say;
  const name = (party.name ?? '').replace(/[„“"]/g, '').replace(/\s+/g, ' ').trim();
  return name && name.length <= 50 ? name : (party.raw ?? party.short);
}

export const isKnown = (party) => party.key === 'IND' || !!SPOKEN[party.raw];
