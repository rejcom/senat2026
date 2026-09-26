// Malý server uvnitř vysílacího kontejneru (bez závislostí, jen vestavěný Node):
//   GET /…              vysílací stránka (sestavený web z /app/dist)
//   GET /tts?text=…     zvuk s přečteným textem (hlas ze serveru, viz TTS_ENGINE)
//   GET /tts/health     je hlas připravený?
//
// TTS_ENGINE = piper (výchozí, zdarma, offline) | azure (Azure Neural, vyžaduje klíč) | off

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT ?? 8787);
const ROOT = process.env.ROOT ?? '/app/dist';
const CACHE = process.env.CACHE_DIR ?? '/data/cache';
const ENGINE = (process.env.TTS_ENGINE ?? 'piper').toLowerCase();

const PIPER_BIN = process.env.PIPER_BIN ?? '/opt/piper/piper';
const PIPER_MODEL = process.env.PIPER_MODEL ?? '/opt/piper/voices/cs_CZ-jirka-medium.onnx';
const PIPER_LENGTH = process.env.PIPER_LENGTH_SCALE ?? '1.0'; // víc než 1 = pomaleji

const AZ_KEY = process.env.AZURE_SPEECH_KEY ?? '';
const AZ_REGION = process.env.AZURE_SPEECH_REGION ?? 'westeurope';
const AZ_VOICE = process.env.AZURE_VOICE ?? 'cs-CZ-VlastaNeural';

fs.mkdirSync(CACHE, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---------- Piper: jeden trvalý proces, model se nenačítá pro každou větu ----------

let piper = null;
let piperBuf = '';
const piperWaiters = []; // čekající požadavky (po jednom, Piper zpracovává řádky postupně)

function startPiper() {
  log('spouštím Piper', path.basename(PIPER_MODEL));
  const p = spawn(PIPER_BIN, ['--model', PIPER_MODEL, '--json-input', '--length_scale', PIPER_LENGTH, '--quiet'], { stdio: ['pipe', 'pipe', 'pipe'] });
  p.stdout.setEncoding('utf8');
  p.stdout.on('data', (d) => {
    piperBuf += d;
    let i;
    while ((i = piperBuf.indexOf('\n')) >= 0) {
      const line = piperBuf.slice(0, i).trim();
      piperBuf = piperBuf.slice(i + 1);
      if (line && piperWaiters.length) piperWaiters.shift().resolve(line); // Piper vypíše cestu k hotovému souboru
    }
  });
  p.stderr.on('data', () => {});
  p.on('exit', (code) => {
    log('Piper skončil', code);
    piper = null;
    for (const w of piperWaiters.splice(0)) w.reject(new Error('Piper skončil'));
  });
  return p;
}

let piperQueue = Promise.resolve();
function piperSynth(text, outFile) {
  const job = piperQueue.then(
    () =>
      new Promise((resolve, reject) => {
        piper ??= startPiper();
        const timer = setTimeout(() => {
          piper?.kill();
          reject(new Error('Piper neodpověděl'));
        }, 45000);
        piperWaiters.push({
          resolve: (l) => {
            clearTimeout(timer);
            resolve(l);
          },
          reject: (e) => {
            clearTimeout(timer);
            reject(e);
          },
        });
        // Diakritika jako \uXXXX: nezávisí na tom, jak Piper (Python) v kontejneru čte vstup (jinak z „č“ vznikne nesmysl)
        const json = JSON.stringify({ text, output_file: outFile }).replace(/[\u0080-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
        piper.stdin.write(`${json}\n`);
      }),
  );
  piperQueue = job.catch(() => {});
  return job;
}

// ---------- Azure Neural ----------

const xmlEsc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
async function azureSynth(text, outFile) {
  const ssml = `<speak version='1.0' xml:lang='cs-CZ'><voice name='${AZ_VOICE}'>${xmlEsc(text)}</voice></speak>`;
  const r = await fetch(`https://${AZ_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': AZ_KEY,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3',
      'User-Agent': 'senat2026-stream',
    },
    body: ssml,
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`Azure ${r.status}`);
  fs.writeFileSync(outFile, Buffer.from(await r.arrayBuffer()));
}

const engineInfo = () => {
  if (ENGINE === 'piper') {
    const ok = fs.existsSync(PIPER_BIN) && fs.existsSync(PIPER_MODEL);
    return { ok, engine: 'piper', voice: path.basename(PIPER_MODEL, '.onnx'), reason: ok ? undefined : 'Chybí Piper nebo hlasový model.' };
  }
  if (ENGINE === 'azure') return { ok: !!AZ_KEY, engine: 'azure', voice: AZ_VOICE, reason: AZ_KEY ? undefined : 'Chybí AZURE_SPEECH_KEY.' };
  return { ok: false, engine: 'off', reason: 'Hlas na serveru je vypnutý.' };
};
const EXT = ENGINE === 'azure' ? 'mp3' : 'wav';
const MIME_AUDIO = ENGINE === 'azure' ? 'audio/mpeg' : 'audio/wav';

async function tts(text) {
  const key = crypto.createHash('sha1').update(`${ENGINE}|${AZ_VOICE}|${PIPER_LENGTH}|${text}`).digest('hex');
  const file = path.join(CACHE, `${key}.${EXT}`);
  if (fs.existsSync(file) && fs.statSync(file).size > 100) return file; // hotová věta z mezipaměti
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}.${EXT}`;
  const t0 = Date.now();
  if (ENGINE === 'piper') await piperSynth(text, tmp);
  else if (ENGINE === 'azure') await azureSynth(text, tmp);
  else throw new Error('hlas je vypnutý');
  fs.renameSync(tmp, file);
  log(`tts ${Date.now() - t0} ms  ${text.length} zn.`);
  return file;
}

// ---------- statické soubory ----------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/tts/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify(engineInfo()));
    }
    if (url.pathname === '/tts') {
      const text = (url.searchParams.get('text') ?? '').trim();
      if (!text || text.length > 700) {
        res.writeHead(400);
        return res.end('bad text');
      }
      const file = await tts(text);
      res.writeHead(200, { 'Content-Type': MIME_AUDIO, 'Cache-Control': 'public, max-age=86400' });
      return fs.createReadStream(file).pipe(res);
    }
    // statické soubory bez úniku mimo ROOT
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(ROOT, path.normalize(rel).replace(/^([/\\]?\.\.[/\\])+/, ''));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404);
      return res.end('not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    log('chyba', e.message);
    res.writeHead(500);
    res.end('error');
  }
});

server.listen(PORT, '0.0.0.0', () => log(`server běží na :${PORT}, hlas: ${JSON.stringify(engineInfo())}`));
