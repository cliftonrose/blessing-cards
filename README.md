# Blessing Cards

A scan-and-receive blessing page. Someone scans the QR on a physical *Blessing Card*,
lands here, and is met with a positive affirmation founded in Scripture — delivered on an
illuminated card that assembles itself in front of them.

**Live:** https://cliftonrose.github.io/blessing-cards/

---

## How it works

Static site — no build step, no framework, no dependencies to install. Three files do the work:

| File | Role |
| --- | --- |
| `index.html` | Structure: the card, the seal, the flourish, the controls |
| `assets/css/styles.css` | The look — parchment card, gold rules, paper grain, dark room |
| `assets/js/blessings.js` | The content — 48 blessings (affirmation + verse + reference) |
| `assets/js/app.js` | Selection, motion, sharing |

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
