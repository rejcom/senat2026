// Čtení komentáře nahlas přes vestavěnou syntézu řeči prohlížeče (Web Speech API). Bez serveru a bez API klíče.
// Prohlížeče povolí zvuk až po kliknutí uživatele, proto se init() volá z tlačítka „Spustit vysílání“.

const SENTENCE_END = /(?<=[A-Za-zěščřžýáíéúůďťňóĚŠČŘŽÝÁÍÉÚŮĎŤŇÓ)]\.)\s+(?=[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ])/;

export function createSpeaker({ rate = 1 } = {}) {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  let voice = null;
  let gen = 0; // zrušení rozmluvené věty

  async function init() {
    if (!synth) return { ok: false, reason: 'Tento prohlížeč neumí číst text nahlas.' };
    let voices = synth.getVoices();
    if (!voices.length) {
      await new Promise((res) => {
        synth.addEventListener('voiceschanged', res, { once: true });
        setTimeout(res, 2500);
      });
      voices = synth.getVoices();
    }
    const cs = voices.filter((v) => /^cs([-_]|$)/i.test(v.lang));
    voice = cs.find((v) => /natural|online/i.test(v.name)) ?? cs.find((v) => v.localService) ?? cs[0] ?? null;
    return voice
      ? { ok: true, name: voice.name }
      : { ok: false, reason: 'V tomto prohlížeči není k dispozici český hlas. Zkuste Microsoft Edge (české hlasy Vlasta a Antonín) nebo doinstalujte český hlas ve Windows.' };
  }

  function say(sentence, myGen) {
    return new Promise((resolve) => {
      if (myGen !== gen) return resolve();
      const u = new SpeechSynthesisUtterance(sentence);
      u.lang = voice?.lang ?? 'cs-CZ';
      if (voice) u.voice = voice;
      u.rate = rate;
      const guard = setTimeout(resolve, sentence.length * 130 + 6000); // pojistka, kdyby se událost „end“ neozvala
      const done = () => {
        clearTimeout(guard);
        resolve();
      };
      u.onend = done;
      u.onerror = done;
      synth.speak(u);
    });
  }

  /** Přečte text po větách (dlouhé texty prohlížeč občas utne). Vrátí se, až dočte nebo když se zruší. */
  async function speak(text) {
    if (!synth || !voice) return;
    const myGen = ++gen;
    synth.cancel();
    for (const s of text.split(SENTENCE_END)) {
      if (myGen !== gen) return;
      await say(s.trim(), myGen);
    }
  }

  function cancel() {
    gen++;
    synth?.cancel();
  }

  return { init, speak, cancel, get voice() { return voice; } };
}

/**
 * Hlas ze serveru (pro vysílání z počítače bez plochy, kde prohlížeč žádný český hlas nemá).
 * Stejné rozhraní jako createSpeaker: init(), speak(text), cancel(), voice.
 * Server (deploy/stream/server.mjs) vrací zvuk na GET /tts?text=…; věty se stahují předem najednou, přehrávají po sobě.
 */
export function createServerSpeaker({ endpoint = 'tts', rate = 1 } = {}) {
  let voice = null;
  let gen = 0;
  let current = null;

  async function init() {
    try {
      const j = await fetch(`${endpoint}/health`, { cache: 'no-store' }).then((r) => r.json());
      if (!j.ok) return { ok: false, reason: j.reason ?? 'Hlasový server není připraven.' };
      voice = { name: j.voice ?? j.engine };
      return { ok: true, name: `${j.engine}${j.voice ? ` (${j.voice})` : ''}` };
    } catch {
      return { ok: false, reason: 'Hlasový server neodpovídá.' };
    }
  }

  const play = (blobUrl, myGen) =>
    new Promise((resolve) => {
      if (myGen !== gen) return resolve();
      const a = new Audio(blobUrl);
      a.playbackRate = rate;
      current = a;
      const guard = setTimeout(resolve, 60000); // pojistka
      const done = () => {
        clearTimeout(guard);
        resolve();
      };
      a.onended = done;
      a.onerror = done;
      a.play().catch(done);
    });

  async function speak(text) {
    if (!voice) return;
    const myGen = ++gen;
    current?.pause();
    const parts = text
      .split(SENTENCE_END)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) =>
        fetch(`${endpoint}?text=${encodeURIComponent(s)}`)
          .then((r) => (r.ok ? r.blob() : null))
          .then((b) => (b ? URL.createObjectURL(b) : null))
          .catch(() => null),
      );
    for (const p of parts) {
      if (myGen !== gen) return;
      const url = await p;
      if (!url) continue; // věta se nepodařila vygenerovat, přeskočí se, komentář běží dál
      await play(url, myGen);
      URL.revokeObjectURL(url);
    }
  }

  function cancel() {
    gen++;
    current?.pause();
  }

  return { init, speak, cancel, get voice() { return voice; } };
}
