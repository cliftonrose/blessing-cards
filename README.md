# Blessing Cards

A scan-and-receive blessing page. Someone scans the QR on a physical *Blessing Card*,
lands here, and is met with a positive affirmation founded in Scripture — delivered on an
illuminated card that assembles itself in front of them.

**Live:** https://cliftonrose.github.io/blessing-cards/

---

## How it works

Static site — no framework, no runtime dependencies, nothing to install to deploy.

| File | Role |
| --- | --- |
| `index.html` | The blessing card |
| `gospel.html` | The Good News — a long read on one sheet |
| `assets/js/ambient.js` | Shared background: drifting motes, the rAF probe |
| `assets/js/gospel.js` | Reveals the Good News as you scroll to it |
| `assets/js/player.js` | Shared listen button: one audio element, ring, fade |
| `assets/css/styles.css` | The look — parchment card, gold rules, paper grain, dark room |
| `assets/js/blessings.js` | The content — 48 blessings (affirmation + verse + reference) |
| `assets/js/app.js` | Selection, motion, playback, sharing |
| `scripts/generate-audio.js` | Pre-records the blessings with ElevenLabs |
| `assets/audio/` | The recordings, plus a generated manifest of what exists |

[anime.js 3.2.2](https://animejs.com) is loaded from a CDN for the reveal timelines.

## URL modes

| URL | Behaviour |
| --- | --- |
| `/` | A random blessing on every scan |
| `/?b=<id>` | Pins one specific blessing — **give each card design its own QR** |
| `/?daily` | Everyone gets the same blessing for the calendar day |

`<id>` values are the `id` fields in `assets/js/blessings.js`, e.g.
`/?b=wonderfully-made`. An unknown id quietly falls back to a random blessing.

The **Share** button always produces a `?b=<id>` permalink, so a blessing that
lands with someone can be passed on exactly as they received it.

## Adding a blessing

Append an entry to `assets/js/blessings.js`:

```js
{
  id: 'kebab-case-and-unique',   // becomes the ?b= permalink
  theme: 'peace',                // tints the ambient glow
  affirmation: 'The short line, spoken over the reader.',
  verse: 'The scripture text.',
  ref: 'Book 1:1'
}
```

Themes: `identity`, `hope`, `strength`, `peace`, `love`, `provision`, `guidance`, `joy`.
Each maps to an ambient hue in `THEMES` at the top of `app.js`.

Scripture is quoted from the **King James Version** (public domain). The
`affirmation` lines are original plain-language restatements, not quotations.

## The Good News

`gospel.html` is a longer read set on a single parchment sheet, reached from the
link in the blessing page footer or straight from its own QR code:

```
https://cliftonrose.github.io/blessing-cards/gospel.html
```

Body copy is set upright rather than italic — italic serif is lovely for a single
verse on a card and punishing across four paragraphs. The three passages are set
apart with a gold rule so they read as scripture rather than prose.

**The passages here are quoted in modern wording, not the KJV used on the cards**,
so the page deliberately credits no translation. Either give it the right
attribution or switch the wording to KJV before this goes out widely.

Paragraphs fade up as they come into view, with the same guarantees as the card:
reduced motion, a missing anime.js, a dead `requestAnimationFrame` or a missed
observer callback all fall back to showing the text outright.

## Spoken blessings

Each blessing can be read aloud by a small play button on the card. Recordings are
**pre-generated** with ElevenLabs and committed to `assets/audio/` — the page never calls
a speech API, so there is no key in the browser, no per-play cost, and no latency beyond
fetching one file.

### Recording them

1. Copy your key from <https://elevenlabs.io/app/settings/api-keys>.
2. Add it to `.env` (gitignored):
   ```
   ELEVENLABS_API_KEY=your-key-here
   ```
3. Record:
   ```bash
   node scripts/generate-audio.js
   ```

Defaults to the **Ash** voice on **eleven_v3**. The voice is resolved by name, matching
either the whole name or the part before the descriptor, since library voices are named
like `Ash - Calm, Soothing, Magnetic Narrative Male Voice`. If your account has neither
the voice nor the model, the script stops and prints what it does have, so you can set
`ELEVENLABS_VOICE_ID` or `ELEVENLABS_MODEL_ID` in `.env` from that list.

A text-to-speech-only key works, but it cannot list voices — set `ELEVENLABS_VOICE_ID`
directly, or tick `voices_read` on the key.

### Delivery

Settled by recording Isaiah 41:10 three ways and listening side by side:

| Take | Result |
| --- | --- |
| Plain text, default settings | Baseline, 26.7s |
| **Explicit breaks, speed 0.92** | **Chosen — 23.5s** |
| v3 audio tags, Creative stability | Too performed for a blessing |

So `VOICE_SETTINGS` and the `<break>` markers at the top of the script are deliberate,
not defaults. Note that plain paragraph breaks produce *longer* pauses than an explicit
`<break time="1.2s" />` — pacing is controlled with `speed`, not by adding breaks.

Useful flags:

| Flag | Effect |
| --- | --- |
| *(none)* | Record only blessings that have no file yet |
| `--force` | Re-record everything |
| `--only id1,id2` | Record just those blessings |
| `--list` | Show the voice, model and how many are recorded; write nothing |
| `--script` | Print the exact words that would be spoken; write nothing |

**Existing files are skipped by default, so re-running costs no credits.** Check
`--script` before a first run — it shows how references are spoken (`1 Peter 5:7`
becomes "First Peter 5, verse 7").

### How the page knows what exists

`scripts/generate-audio.js` writes `assets/audio/manifest.js` listing the recorded ids.
The button is hidden for any blessing not in that list, so a partial set works fine and
the page never requests a file that 404s. The manifest is rewritten after each file, so
an interrupted run still leaves the page consistent.

Audio only ever starts on a press — nothing autoplays — and playback stops when the
reader draws another blessing.

### The Good News narration

The Good News page has its own recording, listed in the manifest as `gospel: true`
and produced by the same run. Its words are **parsed out of `gospel.html`** rather
than kept as a second copy, so editing the page and re-running with `--force --only
gospel` is enough to keep the recording matching what is on screen. If the markup
ever changes shape the parser fails loudly instead of recording a half-empty script.

## Motion

The card starts at `opacity: 0` and is revealed by an anime.js timeline: the card rises
and un-tilts, the seal draws itself stroke by stroke, the affirmation rises word by word
out of a mask, the gold rule expands, the verse fades in, the reference tightens its
letter-spacing, and a sheen passes across the paper.

Because the content starts invisible, `app.js` guards against ever leaving it that way:

- **`prefers-reduced-motion`** — everything renders instantly, no timelines.
- **anime.js fails to load** — detected at boot, renders instantly.
- **`requestAnimationFrame` never fires** (backgrounded tab, throttled webview) — probed
  at boot with `rafAlive()`, renders instantly.
- **A reveal stalls anyway** — a watchdog forces the finished state.

## Running locally

```bash
python -m http.server 4173
```

Then open http://localhost:4173.

## Deploying

Pushing to `main` publishes automatically via GitHub Pages.

```bash
./publish.sh "your commit message"
```

`publish.sh` reads `GITHUB_USER` and `GITHUB_API_TOKEN` from `.env`, which is
gitignored and must never be committed.

## A note on caching

GitHub Pages serves assets with `max-age=600`, so a returning visitor can sit on a
stale stylesheet for ten minutes after a deploy. `publish.sh` re-stamps the `?v=`
query on `index.html`'s asset links each run, so every release is picked up
immediately.
