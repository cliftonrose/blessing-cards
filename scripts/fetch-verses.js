#!/usr/bin/env node
/**
 * Generate assets/js/blessings.js from content/blessings.source.json,
 * pulling verse text from Crossway's ESV API.
 *
 *   node scripts/fetch-verses.js
 *
 * Needs ESV_API_KEY in .env (get one free at https://api.esv.org/).
 * The key is only ever used here, at build time — verse text is baked into the
 * generated file, so nothing but plain text reaches the browser.
 *
 * Never hand-edit assets/js/blessings.js; edit the source JSON and re-run.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'content', 'blessings.source.json');
const OUTPUT = path.join(ROOT, 'assets', 'js', 'blessings.js');

const TRANSLATION = {
  id: 'ESV',
  name: 'English Standard Version',
  /* Crossway requires this notice wherever ESV text is published. */
  notice:
    'Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard ' +
    'Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. ' +
    'Used by permission. All rights reserved.'
};

/* Cards above this get tight on a small phone — worth knowing before deploy. */
const LENGTH_WARN = 250;
const REQUEST_GAP_MS = 150;

function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8').replace(/\r/g, '');
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const value = m[2].replace(/^["']|["']$/g, '');
    if (!(m[1] in process.env)) process.env[m[1]] = value;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPassage(ref, key) {
  const url = new URL('https://api.esv.org/v3/passage/text/');
  url.searchParams.set('q', ref);
  url.searchParams.set('include-passage-references', 'false');
  url.searchParams.set('include-verse-numbers', 'false');
  url.searchParams.set('include-first-verse-numbers', 'false');
  url.searchParams.set('include-footnotes', 'false');
  url.searchParams.set('include-headings', 'false');
  url.searchParams.set('include-short-copyright', 'false');
  url.searchParams.set('include-selahs', 'false');
  url.searchParams.set('indent-paragraphs', '0');
  url.searchParams.set('indent-poetry', 'false');
  url.searchParams.set('indent-declares', '0');
  url.searchParams.set('indent-psalm-doxology', '0');

  const res = await fetch(url, { headers: { Authorization: 'Token ' + key } });

  if (res.status === 401 || res.status === 403) {
    throw new Error('ESV API rejected the key (HTTP ' + res.status + '). Check ESV_API_KEY in .env.');
  }
  if (res.status === 429) {
    throw new Error('ESV API rate limit hit (HTTP 429). Wait and re-run.');
  }
  if (!res.ok) {
    throw new Error('ESV API returned HTTP ' + res.status + ' for "' + ref + '".');
  }

  const body = await res.json();
  const passage = (body.passages || [])[0];
  if (!passage || !passage.trim()) {
    throw new Error('ESV API returned no text for "' + ref + '". Is the reference valid?');
  }
  return passage;
}

function normalise(text) {
  return text
    .replace(/\[\d+\]/g, ' ')       // stray verse numbers
    .replace(/\s*\(ESV\)\s*$/, '')  // short copyright, if it slips through
    .replace(/\s+/g, ' ')
    .trim();
}

/* Trim to the excerpt the card is meant to show, and mark it as partial. */
function applyClip(text, clip, ref) {
  if (!clip) return text;
  let out = text;
  let clippedStart = false;
  let clippedEnd = false;

  if (clip.from) {
    const i = out.toLowerCase().indexOf(clip.from.toLowerCase());
    if (i === -1) throw new Error('clip.from "' + clip.from + '" not found in ' + ref);
    if (i > 0) { out = out.slice(i); clippedStart = true; }
  }

  if (clip.to) {
    const i = out.toLowerCase().indexOf(clip.to.toLowerCase());
    if (i === -1) throw new Error('clip.to "' + clip.to + '" not found in ' + ref);
    const end = i + clip.to.length;
    if (end < out.length) { out = out.slice(0, end); clippedEnd = true; }
  }

  out = out.trim().replace(/^[;,:—-]\s*/, '');
  if (clippedEnd && !/[.!?"']$/.test(out)) out += '.';
  return out;
}

/* Two things make a raw passage read wrong on a card that stands alone:
   a quote mark orphaned by clipping into reported speech, and a verse that
   continues the previous one and so opens in lower case. */
function tidy(text) {
  let out = text.trim();

  if (((out.match(/["“”]/g) || []).length) % 2 === 1) {
    out = out.replace(/^\s*["“”]\s*/, '').replace(/\s*["“”](?=[.,;:!?]*$)/, '');
  }

  return out.replace(/^(\W*)(\w)/, (m, lead, ch) => lead + ch.toUpperCase());
}

function generate(entries) {
  const lines = entries.map((b) => {
    const fields = [
      '    id: ' + JSON.stringify(b.id),
      '    theme: ' + JSON.stringify(b.theme),
      '    affirmation: ' + JSON.stringify(b.affirmation),
      '    verse: ' + JSON.stringify(b.verse),
      '    ref: ' + JSON.stringify(b.ref)
    ];
    return '  {\n' + fields.join(',\n') + '\n  }';
  });

  return [
    '/**',
    ' * GENERATED FILE — do not edit by hand.',
    ' *',
    ' * Regenerate with:  node scripts/fetch-verses.js',
    ' * Edit affirmations and references in content/blessings.source.json.',
    ' *',
    ' * ' + TRANSLATION.notice,
    ' */',
    'window.BLESSING_TEXT = ' + JSON.stringify(
      { translation: TRANSLATION.id, name: TRANSLATION.name, notice: TRANSLATION.notice },
      null, 2
    ).replace(/\n/g, '\n') + ';',
    '',
    'window.BLESSINGS = [',
    lines.join(',\n'),
    '];',
    ''
  ].join('\n');
}

async function main() {
  loadEnv();

  const key = process.env.ESV_API_KEY;
  if (!key) {
    console.error('\nESV_API_KEY is not set.\n');
    console.error('  1. Request a free key at https://api.esv.org/');
    console.error('  2. Add it to .env:  ESV_API_KEY=your-key-here');
    console.error('  3. Re-run:          node scripts/fetch-verses.js\n');
    console.error('.env is gitignored, so the key stays off GitHub.\n');
    process.exit(1);
  }

  const source = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
  console.log('Fetching ' + source.length + ' passages from the ESV API...\n');

  const entries = [];
  const warnings = [];

  for (let i = 0; i < source.length; i++) {
    const b = source[i];
    const raw = await fetchPassage(b.ref, key);
    const verse = tidy(applyClip(normalise(raw), b.clip, b.ref));

    entries.push({ id: b.id, theme: b.theme, affirmation: b.affirmation, verse, ref: b.ref });

    const flag = verse.length > LENGTH_WARN ? '  <-- long' : '';
    if (flag) warnings.push(b.ref + ' (' + verse.length + ' chars)');
    console.log(
      String(i + 1).padStart(2) + '/' + source.length + '  ' +
      b.ref.padEnd(22) + String(verse.length).padStart(4) + ' chars' +
      (b.clip ? '  [excerpt]' : '') + flag
    );

    if (i < source.length - 1) await sleep(REQUEST_GAP_MS);
  }

  fs.writeFileSync(OUTPUT, generate(entries));

  console.log('\nWrote ' + entries.length + ' blessings to assets/js/blessings.js (' + TRANSLATION.id + ').');
  if (warnings.length) {
    console.log('\nLonger than ' + LENGTH_WARN + ' chars — check these on a small phone:');
    for (const w of warnings) console.log('  ' + w);
  }
  console.log('\nNext:  ./publish.sh "Switch scripture to ' + TRANSLATION.id + '"\n');
}

main().catch((err) => {
  console.error('\nFailed: ' + err.message);
  console.error('Nothing was written; assets/js/blessings.js is unchanged.\n');
  process.exit(1);
});
