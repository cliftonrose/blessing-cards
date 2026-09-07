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

const VOICE_NAME = process.env.ELEVENLABS_VOICE_NAME || 'Ash';
const MODEL_ID = process.env.ELEVENLABS_MODEL_ID || 'eleven_v3';
/* 64kbps mono is plenty for a spoken blessing and keeps the repo lean. */
const OUTPUT_FORMAT = process.env.ELEVENLABS_OUTPUT_FORMAT || 'mp3_44100_64';
const EXT = '.mp3';
const REQUEST_GAP_MS = 400;

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

function script(b) {
  return [b.affirmation, b.verse, speakableRef(b.ref)].join('\n\n');
}

async function api(endpoint, key) {
  const res = await fetch(API + endpoint, { headers: { 'xi-api-key': key } });
  if (!res.ok) throw new Error('GET ' + endpoint + ' returned HTTP ' + res.status);
  return res.json();
}

async function resolveVoice(key) {
  if (process.env.ELEVENLABS_VOICE_ID) return { voice_id: process.env.ELEVENLABS_VOICE_ID, name: '(from ELEVENLABS_VOICE_ID)' };

  const { voices } = await api('/voices', key);
  const match = (voices || []).find((v) => v.name.toLowerCase() === VOICE_NAME.toLowerCase());
  if (match) return match;

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
    body: JSON.stringify({ text, model_id: MODEL_ID })
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

  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    console.error('\nELEVENLABS_API_KEY is not set.\n');
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

  const todo = all.filter((b) => {
    if (only && !only.has(b.id)) return false;
    if (force) return true;
    return !fs.existsSync(path.join(AUDIO_DIR, b.id + EXT));
  });

  if (!todo.length) {
    console.log('Every blessing already has a recording. Use --force to re-record.\n');
    writeManifest(recordedIds(all));
    return;
  }

  console.log('Recording ' + todo.length + ' of ' + all.length + ' blessings...\n');

  let bytes = 0;
  for (let i = 0; i < todo.length; i++) {
    const b = todo[i];
    const audio = await speak(script(b), voice.voice_id, key);
    fs.writeFileSync(path.join(AUDIO_DIR, b.id + EXT), audio);
    bytes += audio.length;

    console.log(
      String(i + 1).padStart(3) + '/' + todo.length + '  ' +
      b.id.padEnd(26) + (audio.length / 1024).toFixed(0).padStart(5) + ' KB'
    );

    /* Manifest is rewritten as we go, so an interrupted run still leaves the
       page consistent with whatever was actually recorded. */
    writeManifest(recordedIds(all));

    if (i < todo.length - 1) await sleep(REQUEST_GAP_MS);
  }

  const done = recordedIds(all);
  console.log('\nWrote ' + todo.length + ' files (' + (bytes / 1048576).toFixed(1) + ' MB this run).');
  console.log('Recorded: ' + done.length + ' of ' + all.length + '.');
  console.log('\nNext:  ./publish.sh "Add spoken blessings"\n');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('\nFailed: ' + err.message + '\n');
    process.exit(1);
  });
}

module.exports = { speakableRef, script };
