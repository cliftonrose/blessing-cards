# Blessing Cards

A scan-and-receive blessing page. Someone scans the QR on a physical *Blessing Card*,
lands here, and is met with a positive affirmation founded in Scripture — delivered on an
illuminated card that assembles itself in front of them.

**Live:** https://cliftonrose.github.io/blessing-cards/

---

## How it works

Static site — no build step to deploy, no framework, no runtime dependencies.

| File | Role |
| --- | --- |
| `index.html` | Structure: the card, the seal, the flourish, the controls |
| `assets/css/styles.css` | The look — parchment card, gold rules, paper grain, dark room |
| `content/blessings.source.json` | **Source of truth** — ids, themes, affirmations, references |
| `scripts/fetch-verses.js` | Pulls verse text from the ESV API and generates the file below |
| `assets/js/blessings.js` | **Generated** — do not hand-edit |
| `assets/js/app.js` | Selection, motion, sharing |

[anime.js 3.2.2](https://animejs.com) is loaded from a CDN for the reveal timelines.

## Scripture text

Verse text is **not** written by hand — it is fetched from
[Crossway's ESV API](https://api.esv.org/) at build time and baked into
`assets/js/blessings.js`. That keeps every quotation verified against the publisher
rather than recalled from memory, and keeps the API key out of the browser.

### First-time setup

1. Request a free API key at <https://api.esv.org/>.
2. Add it to `.env` (gitignored, never committed):
   ```
   ESV_API_KEY=your-key-here
   ```
3. Generate the verse data:
   ```bash
   node scripts/fetch-verses.js
   ```
4. Publish:
   ```bash
   ./publish.sh "Switch scripture to ESV"
   ```

The script prints a character count per verse and flags any over 250 characters, which
is roughly where a card starts to get tight on a small phone.

### Licensing

The ESV is copyright Crossway and is **not** public domain. Crossway's standard
permission covers non-commercial use, requires the copyright notice to appear wherever
the text is published, and asks that quotations not exceed 50% of a work's total text.
This app is non-commercial per the project owner. If that ever changes — if the cards
become promotional for a paid product — check with Crossway before continuing.

The required notice is carried in the verse data itself (`window.BLESSING_TEXT.notice`)
and rendered into the page footer, so the credit can never drift out of sync with the
text actually on screen.

## URL modes

| URL | Behaviour |
| --- | --- |
| `/` | A random blessing on every scan |
| `/?b=<id>` | Pins one specific blessing — **give each card design its own QR** |
| `/?daily` | Everyone gets the same blessing for the calendar day |

`<id>` values are the `id` fields in `content/blessings.source.json`, e.g.
`/?b=wonderfully-made`. An unknown id quietly falls back to a random blessing.

The **Share** button always produces a `?b=<id>` permalink, so a blessing that
lands with someone can be passed on exactly as they received it.

## Adding a blessing

Append an entry to `content/blessings.source.json`, then re-run the fetch script:

```json
{
  "id": "kebab-case-and-unique",
  "theme": "peace",
  "affirmation": "The short line, spoken over the reader.",
  "ref": "Philippians 4:6-7"
}
```

Themes: `identity`, `hope`, `strength`, `peace`, `love`, `provision`, `guidance`, `joy`.
Each maps to an ambient hue in `THEMES` at the top of `app.js`.

Note there is no `verse` field — the script fills it in from the reference.

### Showing part of a verse

Some references carry clauses that pull away from the blessing. Add an optional `clip`
with anchor phrases and the script trims to that excerpt, tidying the result (it drops a
quote mark orphaned by the cut and capitalises a verse that opens mid-sentence):

```json
"clip": { "from": "the joy of the LORD" }
```

Both `from` and `to` are optional and matched case-insensitively. If an anchor is not
found the script fails loudly rather than shipping a wrong quotation.

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

```bash
./publish.sh "your commit message"
```

`publish.sh` reads `GITHUB_USER` and `GITHUB_API_TOKEN` from `.env`, commits, and pushes
to `main`, which GitHub Pages publishes automatically.

### A note on caching

GitHub Pages serves assets with `max-age=600`, so a returning visitor can sit on a stale
stylesheet for ten minutes after a deploy. `publish.sh` re-stamps the `?v=` query on
`index.html`'s asset links each run, so a release is always fetched fresh. To force it
sooner while testing, hard-refresh or add any `?x=1` to the URL.
