// Přehledová tabulka všech kandidátů: hledání, rychlé filtry, řazení.
import { fullName } from './data.js';
import { esc, chip, years } from './cards.js';
import { fmt1, fmtInt } from './stats.js';

const QUICK = [
  { id: 'all', label: 'Všichni' },
  { id: 'defends', label: 'Obhájci mandátu' },
  { id: 'F', label: 'Ženy' },
  { id: 'M', label: 'Muži' },
];

const collator = new Intl.Collator('cs');

export function createTable(root, { data, onPick }) {
  root.innerHTML = `
    <div class="table-tools">
      <input type="search" class="search" placeholder="Hledat jméno, povolání, obec, obvod…" aria-label="Hledat kandidáta">
      <div class="quick" role="group" aria-label="Rychlý filtr"></div>
      <div class="count" aria-live="polite"></div>
    </div>
    <div class="table-wrap"><table class="ctable"><thead></thead><tbody></tbody></table></div>`;
  const search = root.querySelector('.search');
  const quick = root.querySelector('.quick');
  const countEl = root.querySelector('.count');
  const thead = root.querySelector('thead');
  const tbody = root.querySelector('tbody');

  let q = '';
  let quickId = 'all';
  let sort = { key: 'obvod', dir: 1 };
  let last = null;

  quick.innerHTML = QUICK.map((f) => `<button type="button" data-q="${f.id}">${f.label}</button>`).join('');
  quick.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    quickId = b.dataset.q;
    render();
  });
  search.addEventListener('input', () => {
    q = search.value.trim().toLowerCase();
    render();
  });
  thead.addEventListener('click', (e) => {
    const th = e.target.closest('th[data-key]');
    if (!th) return;
    const key = th.dataset.key;
    sort = { key, dir: sort.key === key ? -sort.dir : key === 'votes' || key === 'age' ? -1 : 1 };
    render();
  });
  tbody.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-obvod]');
    if (tr) onPick(Number(tr.dataset.obvod));
  });

  const resultRow = (c, results) => results?.get(c.obvod)?.rows.find((r) => r.c === c) ?? null;

  function render(state = last) {
    last = state;
    if (!state) return;
    const { results, partyFilter } = state;
    const showVotes = [...(results?.values() ?? [])].some((r) => r.hasVotes);

    let rows = data.candidates.filter((c) => {
      if (partyFilter && c.party.key !== partyFilter) return false;
      if (quickId === 'defends' && !c.defends) return false;
      if ((quickId === 'F' || quickId === 'M') && c.gender !== quickId) return false;
      if (q) {
        const hay = `${fullName(c)} ${c.occupation} ${c.residence} ${c.obvodName} ${c.obvod} ${c.party.short} ${c.listName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const val = {
      obvod: (c) => c.obvod * 100 + c.no,
      no: (c) => c.no,
      name: (c) => `${c.lastName} ${c.firstName}`,
      age: (c) => c.age,
      party: (c) => c.party.short,
      job: (c) => c.occupation,
      home: (c) => c.residence,
      votes: (c) => {
        const r = resultRow(c, results);
        return r ? (results.get(c.obvod).round === 2 ? (r.votes2 ?? -1) : r.votes1) : -1;
      },
    }[sort.key];
    rows = [...rows].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (typeof x === 'string' ? collator.compare(x, y) : x - y) * sort.dir || a.obvod - b.obvod || a.no - b.no;
    });

    const cols = [
      ['obvod', 'Obvod'],
      ['no', 'Č.'],
      ['name', 'Kandidát'],
      ['age', 'Věk'],
      ['party', 'Strana'],
      ['job', 'Povolání'],
      ['home', 'Bydliště'],
      ...(showVotes ? [['votes', 'Hlasy']] : []),
    ];
    thead.innerHTML = `<tr>${cols
      .map(([k, l]) => `<th data-key="${k}" class="${sort.key === k ? (sort.dir > 0 ? 'asc' : 'desc') : ''}" scope="col">${l}</th>`)
      .join('')}</tr>`;

    tbody.innerHTML = rows
      .map((c) => {
        const r = resultRow(c, results);
        const res = results?.get(c.obvod);
        const votes = r && res?.hasVotes ? (res.round === 2 ? r.votes2 : r.votes1) : null;
        const pct = r ? (res.round === 2 ? r.pct2 : r.pct1) : 0;
        return `<tr data-obvod="${c.obvod}" class="${c.defends ? 'is-defends' : ''}">
          <td class="nowrap">${c.obvod} ${esc(c.obvodName)}</td>
          <td class="num">${c.no}</td>
          <td><b>${esc(fullName(c))}</b>${c.defends ? ' <span class="badge badge--def">obhajuje</span>' : ''}${
            c.senatorOf ? ` <span class="badge badge--out" title="Senátor za obvod ${c.senatorOf.obvod} ${esc(c.senatorOf.name)}">senátor jinde</span>` : ''
          }</td>
          <td class="num nowrap">${years(c.age)}</td>
          <td>${chip(c.party)}${c.member ? '' : ' <span class="muted" title="bez politické příslušnosti">bezp.</span>'}</td>
          <td class="job">${esc(c.occupation)}</td>
          <td class="nowrap">${esc(c.residence)}</td>
          ${showVotes ? `<td class="num nowrap">${votes != null ? `${fmtInt(votes)} <span class="muted">(${fmt1(pct)} %)</span>` : '–'}</td>` : ''}
        </tr>`;
      })
      .join('');

    quick.querySelectorAll('button').forEach((b) => b.classList.toggle('is-on', b.dataset.q === quickId));
    countEl.textContent = `${rows.length} z ${data.candidates.length} kandidátů`;
  }

  return { update: render };
}
