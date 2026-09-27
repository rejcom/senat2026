// Barva kandidátní listiny podle jejího názvu. U komunálních voleb má každá koalice/listina
// v každém městě jiné registrační číslo (OSTRANA), takže se strany nedají spárovat podle ID jako u Senátu
// (src/config.js PARTY_COLORS) – rozpoznávají se podle toho, co obsahuje jejich celý název.
// Pořadí je důležité: kontroluje se první shoda, proto jsou specifičtější/dlouhé zkratky před krátkými.

const KNOWN = [
  [/\bANO\b/i, '#5b3aa0', 'ANO'],
  [/\bSPD\b/i, '#7c4a2d', 'SPD'],
  [/starostové a nezávislí|\bSTAN\b/i, '#e0357f', 'STAN'],
  [/občanská demokratická strana|\bODS\b/i, '#1f77d0', 'ODS'],
  [/komunistická strana|\bKSČM\b/i, '#b71c1c', 'KSČM'],
  [/KDU-ČSL/i, '#e0b000', 'KDU-ČSL'],
  [/\bTOP\s?09\b/i, '#a64bc0', 'TOP 09'],
  [/pirátsk|\bpiráti\b/i, '#2b2b2b', 'Piráti'],
  [/zelen/i, '#2e9e5b', 'Zelení'],
  [/sociální demokracie|\bČSSD\b/i, '#e4572e', 'ČSSD'],
  [/\bpřísah/i, '#0d9488', 'PŘÍSAHA'],
  [/\bSEN\s?21\b/i, '#38a8e8', 'SEN 21'],
  [/trikolora/i, '#c1440e', 'Trikolora'],
  [/motoristé/i, '#0f766e', 'Motoristé'],
  [/svobodní/i, '#374151', 'Svobodní'],
];

// Stálá paleta pro místní/nezařazené listiny (Chceme Plzeň, Stačilo!, Koruna Česká…) – barva se vybírá
// podle hashe názvu, aby zůstala stejná při každém načtení stránky.
const LOCAL_PALETTE = ['#0e7490', '#9333ea', '#ca8a04', '#059669', '#be123c', '#4338ca', '#a16207', '#0369a1'];

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** { color, label } pro danou kandidátní listinu podle jejího plného názvu. */
export function kvPartyStyle(nazev) {
  // „… s podporou X“ znamená jen podporu, ne že je X skutečnou součástí listiny – při rozpoznávání se to nepočítá,
  // jinak by např. „PRO PLZEŇ s podporou lidovců“ vyšlo jako KDU-ČSL.
  const core = nazev.replace(/\bs podporou\b.*$/i, '').trim();
  for (const [re, color, label] of KNOWN) {
    if (re.test(core)) return { color, label };
  }
  const color = LOCAL_PALETTE[hash(nazev) % LOCAL_PALETTE.length];
  return { color, label: null };
}
