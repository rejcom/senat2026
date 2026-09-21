// Kontrolní stránka výslovnosti stran: poslech, úprava výslovnosti, označení „zní dobře“ a hromadné zkopírování výsledku.
// Práce se ukládá v prohlížeči (localStorage), takže se dá kontrola rozdělit na víc dnů.
import { loadData, partyStyle } from './data.js';
import { SPOKEN, speechName, isKnown } from './pronunciation.js';
import { createSpeaker } from './speech.js';
import { esc } from './cards.js';

const $ = (id) => document.getElementById(id);
const data = await loadData();

const counts = new Map();
for (const o of data.obvody) for (const c of o.candidates) counts.set(c.partyId, (counts.get(c.partyId) ?? 0) + 1);
for (const o of data.obvody) if (o.incumbent && !counts.has(o.incumbent.partyId)) counts.set(o.incumbent.partyId, 0);

const HOW = { potvrzeno: 'potvrzeno', ujc: 'ÚJČ', pravidlo: 'pravidlo', uzus: 'uzus', slovo: 'slovo', nazev: 'název', odhad: 'odhad', chybi: 'chybí' };
const KEY = 'senat2026.vyslovnost.kontrola';
let saved = {};
try {
  saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
} catch {
  saved = {};
}
const persist = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    /* localStorage nemusí být dostupné */
  }
};

const rows = [...counts.entries()]
  .map(([id, n]) => {
    const p = partyStyle(id, data.parties);
    const known = isKnown(p);
    const how = known ? (SPOKEN[p.raw]?.how ?? 'slovo') : 'chybi';
    const def = speechName(p);
    const s = saved[p.raw] ?? {};
    return { p, n, def, how, parl: SPOKEN[p.raw]?.parl ?? '', note: SPOKEN[p.raw]?.note ?? '', say: s.say ?? def, ok: s.ok ?? how === 'potvrzeno' };
  })
  // nahoře strany, které už jsou v Senátu nebo ve Sněmovně
  .sort((a, b) => Number(!!b.parl) - Number(!!a.parl) || b.n - a.n || a.p.raw.localeCompare(b.p.raw, 'cs'));

$('rows').innerHTML = rows
  .map(
    (r, i) => `<tr data-i="${i}"><td><button data-play="${i}" title="Přehrát">▶</button></td>
      <td class="abbr">${esc(r.p.raw)}${r.parl ? `<div class="parl">${esc(r.parl)}</div>` : ''}</td><td>${esc(r.p.name)}</td>
      <td class="say"><input class="sayin" data-i="${i}" value="${esc(r.say)}" spellcheck="false" aria-label="Jak se čte ${esc(r.p.raw)}">${r.note ? `<div class="note">${esc(r.note)}</div>` : ''}</td>
      <td class="okc"><label><input type="checkbox" data-ok="${i}" ${r.ok ? 'checked' : ''}> zní dobře</label></td>
      <td><span class="how ${r.how}">${HOW[r.how]}</span></td><td>${r.n}</td></tr>`,
  )
  .join('');

const tr = (i) => $('rows').querySelector(`tr[data-i="${i}"]`);
function refresh() {
  rows.forEach((r, i) => {
    tr(i).classList.toggle('is-edited', r.say.trim() !== r.def);
    tr(i).classList.toggle('is-ok', r.ok);
  });
  $('progress').textContent = `Zkontrolováno ${rows.filter((r) => r.ok).length} z ${rows.length}, upraveno ${rows.filter((r) => r.say.trim() !== r.def).length}`;
}
refresh();

function store(r) {
  const edited = r.say.trim() !== r.def;
  if (edited || r.ok) saved[r.p.raw] = { ...(edited ? { say: r.say.trim() } : {}), ok: r.ok };
  else delete saved[r.p.raw];
  persist();
  refresh();
}

const speaker = createSpeaker({ rate: 1 });
let ready = null;
async function ensure() {
  ready ??= speaker.init().then((v) => {
    $('voice').textContent = v.ok ? `Hlas: ${v.name}` : v.reason;
    return v.ok;
  });
  return ready;
}

$('rows').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-play]');
  if (b && (await ensure())) speaker.speak(rows[Number(b.dataset.play)].say);
});
$('rows').addEventListener('input', (e) => {
  const inp = e.target.closest('input.sayin');
  if (!inp) return;
  const r = rows[Number(inp.dataset.i)];
  r.say = inp.value;
  r.ok = false; // po úpravě je potřeba znovu poslechnout
  tr(Number(inp.dataset.i)).querySelector('[data-ok]').checked = false;
  store(r);
});
$('rows').addEventListener('change', (e) => {
  const c = e.target.closest('input[data-ok]');
  if (!c) return;
  const r = rows[Number(c.dataset.ok)];
  r.ok = c.checked;
  store(r);
});

let stopped = false;
async function playList(list) {
  if (!(await ensure())) return;
  stopped = false;
  for (const r of list) {
    if (stopped) break;
    const row = tr(rows.indexOf(r));
    row.classList.add('is-playing');
    row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    await speaker.speak(r.say);
    row.classList.remove('is-playing');
    await new Promise((res) => setTimeout(res, 450));
  }
}
$('all').onclick = () => playList(rows);
$('unchecked').onclick = () => playList(rows.filter((r) => !r.ok));
$('stop').onclick = () => {
  stopped = true;
  speaker.cancel();
};

$('copy').onclick = async () => {
  const ok = rows.filter((r) => r.ok && r.say.trim() === r.def);
  const fix = rows.filter((r) => r.say.trim() !== r.def);
  const open = rows.filter((r) => !r.ok && r.say.trim() === r.def);
  const text = [
    'Výslovnost stran – výsledek kontroly',
    '',
    `Zní dobře (${ok.length}): ${ok.map((r) => r.p.raw).join(', ') || '–'}`,
    '',
    `Opravit (${fix.length}):`,
    ...(fix.length ? fix.map((r) => `  ${r.p.raw}: „${r.def}“ → „${r.say.trim()}“${r.ok ? ' (potvrzeno poslechem)' : ''}`) : ['  –']),
    '',
    `Nezkontrolováno (${open.length}): ${open.map((r) => r.p.raw).join(', ') || '–'}`,
  ].join('\n');
  $('report').value = text;
  $('report').hidden = false;
  try {
    await navigator.clipboard.writeText(text);
    $('copy').textContent = 'Zkopírováno ✓ – vložte to do chatu';
  } catch {
    $('report').select();
    $('copy').textContent = 'Označte a zkopírujte text níže (Ctrl+C)';
  }
  setTimeout(() => ($('copy').textContent = 'Zkopírovat výsledek pro Claude'), 5000);
};

const missing = rows.filter((r) => r.how === 'chybi');
if (missing.length) console.warn('Není ve slovníku výslovnosti:', missing.map((r) => r.p.raw).join(', '));
