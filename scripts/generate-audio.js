#!/usr/bin/env node
/**
 * Pre-record every blessing with ElevenLabs and write them to assets/audio/.
 *
 *   node scripts/generate-audio.js            # only missing files
 *   node scripts/generate-audio.js --force    # re-record everything
 *   node scripts/generate-audio.js --only wonderfully-made,shepherd
 *   node scripts/generate-audio.js --list     # show voices and models, record nothing
 *
 * Needs ELEVENLABS_API_KEY in .env. The app never calls the API — it just plays
 * the files this script produces, so no key is ever shipped to the browser.
 *
 * Existing files are skipped by default: re-running costs no credits.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const AUDIO_DIR = path.join(ROOT, 'assets', 'audio');
const MANIFEST = path.join(AUDIO_DIR, 'manifest.js');
/* The Good News is a view on the main page now; gospel.html is only a redirect. */
const GOSPEL_PAGE = path.join(ROOT, 'index.html');
const GOSPEL_ID = 'gospel';

const VOICE_NAME = process.env.ELEVENLABS_VOICE_NAME || 'Ash';
const MODEL_ID = process.env.ELEVENLABS_MODEL_ID || 'eleven_v3';
/* 64kbps mono is plenty for a spoken blessing and keeps the repo lean. */
const OUTPUT_FORMAT = process.env.ELEVENLABS_OUTPUT_FORMAT || 'mp3_44100_64';
const EXT = '.mp3';
const REQUEST_GAP_MS = 400;

/* Delivery, settled by listening to three takes of Isaiah 41:10 side by side.
   Explicit break markers are used instead of relying on paragraph breaks, and
   v3 audio tags ([warmly] and friends) were tried and rejected for a plainer,
   less performed read. */
const VOICE_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0,
  use_speaker_boost: true,
  speed: 0.92
};
const PAUSE_AFTER_AFFIRMATION = '1.2s';
const PAUSE_BEFORE_REFERENCE = '1.0s';

const API = 'https://api.elevenlabs.io/v1';

function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8').replace(/\r/g, '');
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    if (!(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadBlessings() {
  global.window = {};
  require(path.join(ROOT, 'assets', 'js', 'blessings.js'));
  return global.window.BLESSINGS;
}

/* "1 Peter 5:7" reads as "First Peter five, verse seven" rather than
   "one Peter five colon seven". */
function speakableRef(ref) {
  const ordinals = { '1': 'First', '2': 'Second', '3': 'Third' };
  let out = ref.replace(/^([123])\s+/, (m, d) => ordinals[d] + ' ');

  return out.replace(/(\d+):(\d+)(?:-(\d+))?$/, (m, chapter, from, to) =>
    to ? `${chapter}, verses ${from} to ${to}` : `${chapter}, verse ${from}`
  );
}

function decode(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Build the Good News narration from gospel.html rather than a second copy of
   the text, so editing the page is enough to keep the recording honest. */
function gospelScript() {
  const html = fs.readFileSync(GOSPEL_PAGE, 'utf8');
  const from = html.indexOf('<div class="sheet__body">');
  const to = from === -1 ? -1 : html.indexOf('</article>', from);
  if (from === -1 || to === -1) {
    throw new Error('Could not find the Good News sheet in ' + path.basename(GOSPEL_PAGE));
  }

  const body = html.slice(from, to);
  /* The \s after the tag name matters: without it "<path class=..." in the SVGs
     matched as a <p>, and the lazy scan on to the next real </p> swallowed a
     whole paragraph of the page — which is how a recording went out missing
     one. */
  const re = /<(h1|p|cite)\s[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/\1>/g;
  const parts = [];
  let m;

  while ((m = re.exec(body)) !== null) {
    const cls = m[2];
    const text = decode(m[3]);
    if (!text) continue;
    if (/sheet__hero/.test(cls)) parts.push({ kind: 'hero', text: text });
    else if (/sheet__text/.test(cls)) parts.push({ kind: 'prose', text: text });
    else if (/passage__text/.test(cls)) parts.push({ kind: 'quote', text: text });
    else if (/passage__ref/.test(cls)) parts.push({ kind: 'ref', text: text });
  }

  /* Count what the markup actually contains and refuse to record anything that
     does not account for all of it. A silently dropped paragraph is the one
     failure here that nobody notices until they hear it. */
  const count = (needle) => (body.match(new RegExp(needle, 'g')) || []).length;
  const expected = {
    hero: count('class="sheet__hero'),
    prose: count('class="sheet__text'),
    quote: count('class="passage__text'),
    ref: count('class="passage__ref')
  };

  Object.keys(expected).forEach(function (kind) {
    const got = parts.filter((p) => p.kind === kind).length;
    if (got !== expected[kind]) {
      throw new Error(
        'Parsed ' + got + ' ' + kind + ' block(s) but the page has ' + expected[kind] + '.\n' +
        'Refusing to record a narration that does not match what is on screen.'
      );
    }
  });

  if (!expected.hero || !expected.quote) {
    throw new Error('Found no hero or passages in the Good News markup.');
  }

  return parts.map(function (p, i) {
    const last = i === parts.length - 1;
    if (p.kind === 'ref') {
      return speakableRef(p.text) + (last ? '' : '<break time="1.2s" />');
    }
    if (p.kind === 'quote') {
      const text = /[.!?]$/.test(p.text) ? p.text : p.text + '.';
      return text + '<break time="0.6s" />';
    }
    return p.text + (last ? '' : '<break time="1.0s" />');
  }).join('');
}

function script(b) {
  return b.affirmation +
    '<break time="' + PAUSE_AFTER_AFFIRMATION + '" />' +
    b.verse +
    '<break time="' + PAUSE_BEFORE_REFERENCE + '" />' +
    speakableRef(b.ref);
}

async function api(endpoint, key) {
  const res = await fetch(API + endpoint, { headers: { 'xi-api-key': key } });
  if (!res.ok) throw new Error('GET ' + endpoint + ' returned HTTP ' + res.status);
  return res.json();
}

async function resolveVoice(key) {
  if (process.env.ELEVENLABS_VOICE_ID) return { voice_id: process.env.ELEVENLABS_VOICE_ID, name: '(from ELEVENLABS_VOICE_ID)' };

  let voices;
  try {
    ({ voices } = await api('/voices', key));
  } catch (err) {
    /* A text-to-speech-only key can synthesise but not list voices. That is
       fine — it just has to be told which voice to use. */
    if (/HTTP 401/.test(err.message)) {
      throw new Error(
        'This key can generate speech but cannot list voices (missing "voices_read").\n\n' +
        'Either:\n' +
        '  a) tick voices_read on the key at https://elevenlabs.io/app/settings/api-keys, or\n' +
        '  b) put the voice id straight in .env:  ELEVENLABS_VOICE_ID=<id>\n\n' +
        'The id is in the URL when you open a voice in the ElevenLabs Voices page.'
      );
    }
    throw err;
  }
  /* Library voices carry a descriptor, e.g. "Ash - Calm, Soothing, Magnetic
     Narrative Male Voice", so compare against the name before the separator
     as well as the whole string. */
  const wanted = VOICE_NAME.trim().toLowerCase();
  const leading = (name) => name.split(/\s*[-—,(]/)[0].trim().toLowerCase();

  const hits = (voices || []).filter(
    (v) => v.name.trim().toLowerCase() === wanted || leading(v.name) === wanted
  );

  if (hits.length === 1) return hits[0];

  if (hits.length > 1) {
    throw new Error(
      'More than one voice matches "' + VOICE_NAME + '":\n' +
      hits.map((v) => '  ' + v.name + '  (' + v.voice_id + ')').join('\n') +
      '\n\nPick one and set ELEVENLABS_VOICE_ID in .env.'
    );
  }

  const names = (voices || []).map((v) => '  ' + v.name + '  (' + v.voice_id + ')').join('\n');
  throw new Error(
    'No voice named "' + VOICE_NAME + '" in this account.\n\nAvailable voices:\n' + names +
    '\n\nAdd the one you want to .env as ELEVENLABS_VOICE_ID, or add "' + VOICE_NAME +
    '" to your account from the ElevenLabs Voice Library.'
  );
}

async function checkModel(key) {
  let models;
  try {
    models = await api('/models', key);
  } catch {
    return; // Not fatal — the TTS call will report a bad model itself.
  }
  const ids = (models || []).map((m) => m.model_id);
  if (ids.includes(MODEL_ID)) return;

  const canTts = (models || [])
    .filter((m) => m.can_do_text_to_speech !== false)
    .map((m) => '  ' + m.model_id + (m.name ? '  — ' + m.name : ''))
    .join('\n');
  throw new Error(
    'Model "' + MODEL_ID + '" is not available to this account.\n\n' +
    'Models this key can use for text-to-speech:\n' + canTts +
    '\n\nSet ELEVENLABS_MODEL_ID in .env to one of these.'
  );
}

async function speak(text, voiceId, key) {
  const url = API + '/text-to-speech/' + voiceId + '?output_format=' + OUTPUT_FORMAT;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': key,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg'
    },
    body: JSON.stringify({ text, model_id: MODEL_ID, voice_settings: VOICE_SETTINGS })
  });

  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body && body.detail
        ? ' — ' + (body.detail.message || JSON.stringify(body.detail))
        : '';
    } catch { /* non-JSON error body */ }

    if (res.status === 401) throw new Error('ElevenLabs rejected the key (401). Check ELEVENLABS_API_KEY.' + detail);
    if (res.status === 429) throw new Error('Rate limited or out of credits (429).' + detail);
    throw new Error('ElevenLabs returned HTTP ' + res.status + detail);
  }

  return Buffer.from(await res.arrayBuffer());
}

function writeManifest(ids) {
  const body = [
    '/**',
    ' * GENERATED FILE — do not edit by hand.',
    ' * Written by scripts/generate-audio.js.',
    ' *',
    ' * Lists which blessings have a recording, so the page can hide the listen',
    ' * button for any that do not rather than requesting a file that 404s.',
    ' */',
    'window.BLESSING_AUDIO = {',
    '  dir: "assets/audio/",',
    '  ext: ' + JSON.stringify(EXT) + ',',
    '  gospel: ' + fs.existsSync(path.join(AUDIO_DIR, GOSPEL_ID + EXT)) + ',',
    '  ids: [',
    ids.map((id) => '    ' + JSON.stringify(id)).join(',\n'),
    '  ]',
    '};',
    ''
  ].join('\n');
  fs.writeFileSync(MANIFEST, body);
}

function recordedIds(all) {
  return all
    .map((b) => b.id)
    .filter((id) => fs.existsSync(path.join(AUDIO_DIR, id + EXT)));
}

async function main() {
  loadEnv();

  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const listOnly = args.includes('--list');
  const onlyArg = args.indexOf('--only');
  const only = onlyArg !== -1 && args[onlyArg + 1]
    ? new Set(args[onlyArg + 1].split(',').map((s) => s.trim()))
    : null;

  const key = process.env.ELEVENLABS_API_KEY
    || process.env.ELEVEN_LABS_TEXT_TO_SPEECH_API_KEY
    || process.env.ELEVENLABS_KEY;
  if (!key) {
    console.error('\nNo ElevenLabs key found in .env.');
    console.error('Looked for ELEVENLABS_API_KEY, ELEVEN_LABS_TEXT_TO_SPEECH_API_KEY, ELEVENLABS_KEY.\n');
    console.error('  1. Copy your key from https://elevenlabs.io/app/settings/api-keys');
    console.error('  2. Add it to .env:  ELEVENLABS_API_KEY=your-key-here');
    console.error('  3. Re-run:          node scripts/generate-audio.js\n');
    console.error('.env is gitignored, so the key stays off GitHub.\n');
    process.exit(1);
  }

  fs.mkdirSync(AUDIO_DIR, { recursive: true });

  const voice = await resolveVoice(key);
  await checkModel(key);
  console.log('Voice: ' + voice.name + ' (' + voice.voice_id + ')');
  console.log('Model: ' + MODEL_ID + '   Format: ' + OUTPUT_FORMAT + '\n');

  const all = loadBlessings();

  if (listOnly) {
    console.log('Recorded: ' + recordedIds(all).length + ' of ' + all.length + '. Nothing written (--list).\n');
    return;
  }

  if (args.includes('--script')) {
    for (const b of all) console.log('--- ' + b.id + ' ---\n' + script(b) + '\n');
    console.log('Nothing written (--script).\n');
    return;
  }

  /* The Good News narration is just another recording, drawn from the page
     rather than from a blessing entry. */
  const jobs = all
    .map((b) => ({ id: b.id, text: script(b) }))
    .concat([{ id: GOSPEL_ID, text: gospelScript() }]);

  const todo = jobs.filter((j) => {
    if (only && !only.has(j.id)) return false;
    if (force) return true;
    return !fs.existsSync(path.join(AUDIO_DIR, j.id + EXT));
  });

  if (!todo.length) {
    console.log('Everything already has a recording. Use --force to re-record.\n');
    writeManifest(recordedIds(all));
    return;
  }

  console.log('Recording ' + todo.length + ' of ' + jobs.length + '...\n');

  let bytes = 0;
  for (let i = 0; i < todo.length; i++) {
    const job = todo[i];
    const audio = await speak(job.text, voice.voice_id, key);
    fs.writeFileSync(path.join(AUDIO_DIR, job.id + EXT), audio);
    bytes += audio.length;

    console.log(
      String(i + 1).padStart(3) + '/' + todo.length + '  ' +
      job.id.padEnd(26) + (audio.length / 1024).toFixed(0).padStart(5) + ' KB'
    );

    /* Manifest is rewritten as we go, so an interrupted run still leaves the
       page consistent with whatever was actually recorded. */
    writeManifest(recordedIds(all));

    if (i < todo.length - 1) await sleep(REQUEST_GAP_MS);
  }

  const done = recordedIds(all);
  console.log('\nWrote ' + todo.length + ' files (' + (bytes / 1048576).toFixed(1) + ' MB this run).');
  console.log('Blessings recorded: ' + done.length + ' of ' + all.length + '.');
  console.log('Good News recorded: ' + fs.existsSync(path.join(AUDIO_DIR, GOSPEL_ID + EXT)) + '.');
  console.log('\nNext:  ./publish.sh "Add spoken blessings"\n');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('\nFailed: ' + err.message + '\n');
    process.exit(1);
  });
}

module.exports = { speakableRef, script };
