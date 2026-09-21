// Demo režim (?demo=1 nebo ?demo=2): vygeneruje FIKTIVNÍ výsledky ve stejném XML jako ČSÚ
// a pošle je stejným parserem jako živá data. Slouží jen k vyzkoušení vzhledu před volbami.

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * level 1 = probíhá sčítání 1. kola (část obvodů hotová)
 * level 2 = hotové 1. kolo a druhé kolo v obvodech bez zvoleného kandidáta
 */
export function demoXml(obvody, level) {
  const out = [];
  out.push('<?xml version="1.0" encoding="utf-8"?>');
  out.push(`<VYSLEDKY xmlns="http://www.volby.cz/senat/" DATUM_CAS_GENEROVANI="${new Date().toISOString().slice(0, 19)}">`);

  for (const o of obvody) {
    const rand = rng(o.id * 7919);
    const n = o.candidates.length;
    const weights = o.candidates.map((c, i) => (c.defends ? 2.2 : 1) * (0.3 + rand()) * (n - i * 0.15));
    const sum = weights.reduce((a, b) => a + b, 0);
    const voters = 60000 + Math.round(rand() * 60000);
    const precincts = 120 + Math.round(rand() * 200);
    const done = level >= 2 || rand() > 0.4 ? precincts : Math.round(precincts * (0.3 + rand() * 0.6));
    const finished = done === precincts;
    const turnout = 0.3 + rand() * 0.1;
    const valid = Math.round(voters * turnout * (done / precincts));

    const votes1 = weights.map((w) => Math.round((w / sum) * valid));
    const order = votes1.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
    const majority = votes1[order[0]] > valid / 2;

    const status1 = o.candidates.map(() => null);
    if (finished) {
      order.forEach((idx, rank) => {
        status1[idx] = majority ? (rank === 0 ? 'ZVOLEN' : 'NEZVOLEN') : rank < 2 ? '2.KOLO' : 'NEZVOLEN';
      });
    }

    let votes2 = null;
    let status2 = null;
    if (level >= 2 && finished && !majority) {
      const [a, b] = order;
      const share = 0.5 + (rand() - 0.5) * 0.25;
      const v2 = Math.round(voters * (0.25 + rand() * 0.08));
      votes2 = o.candidates.map(() => null);
      status2 = o.candidates.map(() => null);
      votes2[a] = Math.round(v2 * share);
      votes2[b] = v2 - votes2[a];
      status2[a] = votes2[a] >= votes2[b] ? 'ZVOLEN' : 'NEZVOLEN';
      status2[b] = status2[a] === 'ZVOLEN' ? 'NEZVOLEN' : 'ZVOLEN';
    }

    out.push(`<OBVOD CISLO="${o.id}" NAZEV="${esc(o.name)}">`);
    o.candidates.forEach((c, i) => {
      let a =
        `PORADOVE_CISLO="${c.no}" JMENO="${esc(c.firstName)}" PRIJMENI="${esc(c.lastName)}" TITULPRED="" TITULZA="" ` +
        `HLASY_1KOLO="${votes1[i]}" HLASY_PROC_1KOLO="${valid ? ((votes1[i] / valid) * 100).toFixed(2) : '0.00'}"`;
      if (status1[i]) a += ` ZVOLEN_1KOLO="${status1[i]}"`;
      if (votes2?.[i] != null) {
        const v2total = votes2.reduce((s, x) => s + (x ?? 0), 0);
        a += ` HLASY_2KOLO="${votes2[i]}" HLASY_PROC_2KOLO="${((votes2[i] / v2total) * 100).toFixed(2)}" ZVOLEN_2KOLO="${status2[i]}"`;
      }
      out.push(`<KANDIDAT ${a}/>`);
    });
    const t1 =
      `<UCAST KOLO="1" OKRSKY_CELKEM="${precincts}" OKRSKY_ZPRAC="${done}" OKRSKY_ZPRAC_PROC="${((done / precincts) * 100).toFixed(2)}" ` +
      `ZAPSANI_VOLICI="${voters}" VYDANE_OBALKY="0" UCAST_PROC="${(turnout * 100).toFixed(2)}" VOLICSKE_PRUKAZY="0" ODEVZDANE_OBALKY="0" ` +
      `PLATNE_HLASY="${valid}" PLATNE_HLASY_PROC="99.50"/>`;
    out.push(t1);
    if (votes2) {
      const v2total = votes2.reduce((s, x) => s + (x ?? 0), 0);
      out.push(
        `<UCAST KOLO="2" OKRSKY_CELKEM="${precincts}" OKRSKY_ZPRAC="${precincts}" OKRSKY_ZPRAC_PROC="100.00" ZAPSANI_VOLICI="${voters}" ` +
          `VYDANE_OBALKY="0" UCAST_PROC="${((v2total / voters) * 100).toFixed(2)}" VOLICSKE_PRUKAZY="0" ODEVZDANE_OBALKY="0" PLATNE_HLASY="${v2total}" PLATNE_HLASY_PROC="99.60"/>`,
      );
    }
    out.push('</OBVOD>');
  }
  out.push('</VYSLEDKY>');
  return out.join('\n');
}
