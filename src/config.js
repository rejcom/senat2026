// Nastavení aplikace.

// Živé výsledky přímo z ČSÚ. Server posílá `access-control-allow-origin: *`,
// takže je prohlížeč umí číst bez vlastního serveru. ČSÚ je generuje s 60s cache.
export const RESULTS_URL = 'https://volby.gov.cz/appdata/senat/20261009/odata/vysledky.xml';
export const REFRESH_MS = 60_000;

// Barvy podle nominující strany (NSTRANA z registru ČSÚ). Co tu není, spadne do „Ostatní“.
export const PARTY_COLORS = {
  768: '#5b3aa0', // ANO 2011
  1114: '#7c4a2d', // SPD
  166: '#e0357f', // STAN
  53: '#1f77d0', // ODS
  47: '#b71c1c', // KSČM
  1: '#e0b000', // KDU-ČSL
  721: '#a64bc0', // TOP 09
  720: '#2b2b2b', // Piráti
  5: '#2e9e5b', // Zelení
  759: '#e4572e', // ČSSD
  7: '#e4572e', // Sociální demokracie
  1245: '#0d9488', // PŘÍSAHA
  1187: '#38a8e8', // SEN 21
};

export const IND_ID = '80'; // „Nezávislý kandidát“
export const IND_COLOR = '#64748b';
export const OTHER_COLOR = '#a8b0ba';

export const MODES = [
  { id: 'incumbent', label: 'Obhájce mandátu' },
  { id: 'leader', label: 'Vedoucí / zvolený' },
  { id: 'count', label: 'Počet kandidátů' },
  { id: 'age', label: 'Průměrný věk' },
];
