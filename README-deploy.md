# Cocktail Codex — deploy bundle

Everything in this folder goes to the **GitHub repo, same directory as `codexdata.js`**.
The `.gs` files are *not* here — those get pasted into the Apps Script project instead
(see the bottom of this file).

---

## Upload these 14 files  (see also `CLEANUP.md`)

| File | What it is | Notes |
|---|---|---|
| `index.html` | main app | crab + asterism header art, `favicon-16` link added |
| `menu.html` | menu view | `favicon-16` link added |
| `crab-melted.png` | header art, crab layer | **new filename** — see cache note below |
| `crab-melted@2x.png` | expanded view (easter egg) | lazy-loaded, only on first open |
| `favicon.svg` | primary favicon | vector, scales to any size |
| `favicon-32.png` | favicon fallback | for browsers without SVG favicon support |
| `favicon-16.png` | favicon fallback | small-size tab rendering |
| `apple-touch-icon.png` | iOS home screen | 180×180, art inset to 92% |
| `icon-192.png` | PWA icon | `purpose: any` |
| `icon-512.png` | PWA icon | `purpose: any` |
| `icon-192-maskable.png` | Android adaptive icon | `purpose: maskable` |
| `icon-512-maskable.png` | Android adaptive icon | `purpose: maskable` |
| `site.webmanifest` | PWA manifest | **compare with yours before overwriting** |

Drag-and-drop into the GitHub web UI works fine; it overwrites by filename.

---

## Three things worth knowing

### 1. `crab-melted.png` is a new filename, on purpose
The earlier header art was `crab-detail.png`. If that name is already live, a browser
that cached it would keep serving the old image even after you push a new one. A fresh
filename sidesteps the cache entirely. Nothing references `crab-detail.png` any more,
so you can delete it from the repo if it's there.

### 2. `site.webmanifest` — one real bug fixed
This is now **your** manifest, merged. Everything is preserved verbatim — `name`,
`short_name`, `description`, `start_url`, `display`, `background_color`, `theme_color`.
**Only the `icons` array changed.**

Yours declared both PWA icons as `"purpose": "any maskable"`. That single string means
Android uses those exact files as adaptive icons **and crops them to a circle** — which
is the one case where the Sentry loses its claw and leg tips (see below). The fix is to
split the purposes across separate files:

| | before | after |
|---|---|---|
| `icon-192.png` / `icon-512.png` | `any maskable` | `any` |
| `icon-192-maskable.png` / `icon-512-maskable.png` | — | `maskable` |

`favicon.svg` stays in the array as you had it.

### 3. The maskable icons are cropped smaller for a reason
Android crops adaptive icons to a circle or squircle, keeping only the central 80%.
Measured against that, **18% of the Sentry artwork fell outside the safe zone** — the
claw tips and leg tips would have been sliced off. So the maskable variants scale the
art to **65%** and centre it, which puts the outermost point at 34.3% radius against the
40% limit. They will look smaller than the `any` icons side by side. That is correct;
they are filling a different box.

The `any` icons stay full-bleed, since they get displayed uncropped.

---

### 4. `theme-color` was inconsistent — now aligned
Three different near-black values were in play:

- page background (`--bg`): `#17110f`
- HTML `<meta name="theme-color">`: `#140f0c`
- manifest `theme_color` / `background_color`: `#130f0c`

The meta-vs-manifest mismatch is the one that mattered: the meta tag wins in a browser
tab while the manifest wins for an installed PWA, so the browser chrome tint **shifted
when the app was installed**. I aligned the meta to `#130f0c`, since that value already
appears in both manifest fields *and* as the end stop of the favicon's background
gradient — the meta was the outlier.

Optional, not changed: `background_color` is the PWA splash-screen colour, and at
`#130f0c` it is a shade darker than the page's `#17110f`. You may see a brief flash on
launch as one gives way to the other. Setting `background_color` to `#17110f` removes
that. Left alone because it is a judgement call, not a bug.

---

## HTML head changes

Both files already pointed at `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`
and `site.webmanifest` with exactly these filenames, so the new icons simply replace
the old ones. `theme-color` is already `#140f0c` and matches the manifest.

Two small edits, both files:

```html
<!-- added -->
<link rel="icon" href="favicon-16.png" sizes="16x16" type="image/png">

<!-- changed, to match the manifest -->
<meta name="theme-color" content="#130f0c">
```

---

## If the icon does not change after uploading

**Check whether the file is actually live before re-uploading anything.** Open the icon
URL directly in a new tab — not the site, the icon itself:

```
https://<your-site>/favicon.svg
```

- **You see the crab-and-coupe** → the file deployed fine and your *browser* was caching
  the old favicon. Nothing more to upload.
- **404** → the file is not at the repo root. Most likely cause: the whole
  `github-upload` folder got dragged in, so everything landed at
  `/github-upload/favicon.svg`. The files must sit **beside `codexdata.js`**, not in
  a subfolder.
- **You see the old coupe icon** → GitHub Pages' CDN is still serving the cached copy.
  It clears on its own within about 10 minutes.

### Filenames are canonical again — see `CLEANUP.md`
An earlier pass used `-v2` / `-v3` suffixes to force a favicon refresh. That worked but
littered the repo. Cache-busting now uses a `?v=3` query string instead, so filenames
stay clean and future changes only bump the number. **`CLEANUP.md` lists the old files
to delete.**

### Force a local refresh
- **Desktop:** open the icon URL directly (above), then hard-reload the site
  (Cmd/Ctrl+Shift+R). If it still sticks, clear site data for the domain.
- **iOS home screen:** remove the shortcut and re-add it. `apple-touch-icon` is only
  read at the moment the shortcut is created — it never refreshes in place.
- **Android PWA:** uninstall and reinstall the app for the maskable icons to re-read.

---

## The asterism alternates between X and Y on its own

Cancer has two accepted stick figures — the inverted **Y**, and the same shape plus a
fork up to **χ Cancri** (the **X**). Rather than picking one, `index.html` flips a coin
on each page load.

It costs almost nothing because **Y is literally X minus one star and one line.** Both
live in a single SVG layer; the χ star and its line to γ are wrapped in
`<g class="ha-chi">`, and that group is what toggles:

```css
.header-art   .ha-chi { display:none }    /* default -> Y */
.header-art.x .ha-chi { display:inline }  /* with .x  -> X */
```

```js
(function(){ var a=document.querySelector('.header-art');
             if (a && Math.random() < 0.5) a.classList.add('x'); })();
```

Hidden by default on purpose, so a visitor with JS disabled gets a clean Y rather than a
broken layer — and there is never a flash of the arm disappearing after paint.

**To pin one instead of alternating**, edit the condition in that script:

| you want | change `Math.random() < 0.5` to |
|---|---|
| always X (fork) | `true` |
| always Y (inverted Y) | `false` |
| favour X 3 loads in 4 | `Math.random() < 0.75` |

Both variants share an identical **1086 × 950** viewBox, so nothing else moves — no CSS
size change, no re-measuring, no change to the `.eyebrow` reserve.

### Greek labels — available, but not enabled
Labelled versions (ι χ γ δ α β) are in the project as reference images. They are *not*
in the header, because at 130px the glyphs render about **6.6px** tall — they read as
small marks rather than letters. At 178px they reach ~9px and become borderline
readable, so labels would mean going back up in size.

---

## Easter egg: the watermark expands

Clicking (or tabbing to and pressing Enter on) the header watermark opens a large
labelled view of the constellation over the crab, with the Greek letters at a size
where they are actually readable and a caption naming each star.

There is **no visible affordance at rest** — hover or keyboard focus brightens the crab
and stars slightly, and that is the only hint. Find it or don't.

**It costs nothing until someone finds it.** `crab-melted@2x.png` (158KB) is declared
with *no* `src` attribute; JS sets it on first open. A visitor who never clicks never
downloads it.

Implementation notes, in case you edit around it:

- The watermark is a real `<button>` with an `aria-label`, not a click-handling div, so
  it is keyboard-reachable. An easter egg nobody can reach by keyboard is just an
  exclusion.
- It hooks the existing `_pushNav` / `_closeNav` history stack, the same one `openSheet`
  and `openForm` use. So **the browser Back button and the Android back gesture close
  it**, rather than navigating away from the app.
- The expanded figure **mirrors the header's X/Y coin flip.** Its own `.ha-chi` group is
  scoped with `.starfig .ha-chi`, and `openStars()` copies the `.x` class across — so
  expanding a Y watermark does not suddenly grow a sixth star.
- Closes on: the × button, the scrim, clicking outside the figure, or Back.

### Files this adds
| File | Size | Notes |
|---|---|---|
| `crab-melted@2x.png` | 158KB | 1000px wide, 96-colour palette. Lazy — only fetched on first open. |

---

## Source credit needs the new `PublishCodex.gs`

The recipe card now credits the source by name. `PublishCodex.gs` v2 exports it as `sn`
— column Z's visible text — alongside the existing `src` URL.

Paste the new `PublishCodex.gs` into Apps Script and run **Publish Codex to GitHub**.
Until you do, the card falls back to a domain label ("Source: YouTube"), which is why
this is a nice-to-have rather than a blocker.

Why both fields are needed: **692 of 913 links are YouTube**, and a YouTube URL carries a
video ID, never the channel name — so the creator cannot be derived on the client. And
**Crabby Melter has no URL at all** (`src: null`), so without `sn` it shows no
attribution; with it, the card reads *Source: Dad*.

## After pushing

Favicons are cached hard. To confirm the new one is live, hard-reload
(Cmd/Ctrl+Shift+R) or open the icon URL directly, e.g. `.../favicon.svg`. On iOS you
have to remove and re-add the home screen shortcut to pick up a new
`apple-touch-icon`.

---

## Apps Script side — NOT part of this upload

These are pasted into the Apps Script editor, not the repo:

- `TagFamilies.gs`
- `TagHolidays.gs`
- `TagMoods.gs`
- `TagSeason.gs`
- `CodexMaintenance.gs`
- `Menu.gs`

**Reload the spreadsheet after pasting `Menu.gs`** — `onOpen` only runs on load, so the
ribbon won't show new items until you refresh the tab.

Run order (the four taggers are independent of each other; only Publish must be last):

1. `tagFamilies` — column AX
2. `tagHolidays` — column AW
3. `tagMoods` — column AU (fills blanks only)
4. `tagSeason` — column AV (fills blanks only)
5. `publishCodexData` — pushes `codexdata.js` so the app sees the new tags
