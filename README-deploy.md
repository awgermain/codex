# Cocktail Codex — deploy bundle

Everything in this folder goes to the **GitHub repo, same directory as `codexdata.js`**.
The `.gs` files are *not* here — those get pasted into the Apps Script project instead
(see the bottom of this file).

---

## Upload these 12 files

| File | What it is | Notes |
|---|---|---|
| `index.html` | main app | crab + asterism header art, `favicon-16` link added |
| `menu.html` | menu view | `favicon-16` link added |
| `crab-melted.png` | header art, crab layer | **new filename** — see cache note below |
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
art to **72%** and centre it, which puts the outermost point at 38% radius against the
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
