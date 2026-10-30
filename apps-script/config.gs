/**
 * Cocktail Codex — shared config
 * ------------------------------
 * RC_TAB is the name of the master amounts table. Every script reads it from
 * here, so the tab name lives in exactly one place.
 *
 * TO RENAME the master tab (e.g. to "RC - AmountIndex"):
 *   1) Change the string below.
 *   2) Rename the actual sheet tab in Google Sheets to match.
 * That's it. In-sheet formulas that reference the tab update automatically when
 * you rename it; this constant keeps the Apps Script side in sync.
 *
 * NOTE: this file must be present in the project — the other scripts depend on
 * RC_TAB being defined here.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * v2 adds COLUMN LOOKUP BY HEADER.
 *
 * Every script used to hardcode column numbers (Family = 50, Served = 24, and
 * so on). That works until you insert a column, at which point everything to
 * its right shifts by one and each script silently reads the wrong field —
 * the worst kind of breakage, because nothing errors, the data just goes wrong.
 *
 * COL('Family') asks the sheet where 'Family' actually is. Insert, move or
 * reorder columns freely; the scripts follow. A typo'd or renamed header now
 * throws immediately instead of corrupting data quietly.
 *
 * Requires: header names in row 1 of 'Cocktails' are unique (verified: all 52
 * are, after the 'Muddled' insert at col 23) and non-blank.
 * ────────────────────────────────────────────────────────────────────────────
 */
var RC_TAB = 'RC - AmountIndex';   // e.g. 'RC - AmountIndex'

/** Ingredient columns, in the order they should appear on a recipe card.
 *  Add a new one here and every script picks it up — no column numbers anywhere.
 *  The header string must match row 1 of 'Cocktails' exactly. */
var CODEX_ING_GROUPS = [
  ['Spirit Base',  'Spirit'],
  ['Spirit 2',     'Spirit'],
  ['Spirit 3',     'Spirit'],
  ['Modifier 1',   'Modifier'],
  ['Modifier 2',   'Modifier'],
  ['Modifier 3',   'Modifier'],
  ['Acid 1',       'Acid'],
  ['Acid 2',       'Acid'],
  ['Acid 3',       'Acid'],
  ['Sweetener 1',  'Sweetener'],
  ['Sweetener 2',  'Sweetener'],
  ['Sweetener 3',  'Sweetener'],
  ['Seasoning 1',  'Seasoning'],
  ['Seasoning 2',  'Seasoning'],
  ['Top / Mixer',  'Top / Mix'],
  // 'Muddled' sits ABOVE 'Other' so the recipe card lists muddled ingredients
  // before the junk drawer, matching the physical column order in the sheet
  // (Muddled is col 23, Other col 24). Position in THIS list is the only thing
  // that controls card order -- move the line to move it on the card.
  ['Muddled',      'Muddled'],
  ['Other',        'Other']
];

/** Categories that are NOT tracked in My Bar, so the app should not show a
 *  have/missing dot for them. Published to the app so it stays in one place. */
// 'Muddled' is untracked for the same reason as 'Other': it holds leaves, fruit and
// egg white rather than bottles, so a My Bar match is meaningless and the dot read
// permanently red. Note there is deliberately NO 'MU' flag column in the sheet's
// AB:AP block either -- MI's =SUM(AB:AP) therefore never counts a muddled
// ingredient as missing, which is the in-sheet half of the same decision.
var CODEX_UNTRACKED_CATS = ['Other', 'Muddled'];

var _CODEX_HDR = null;

/** Header name -> 1-based column index on 'Cocktails'. Cached per execution. */
function codexHeaderMap_(){
  if (_CODEX_HDR) return _CODEX_HDR;
  var sh = SpreadsheetApp.getActive().getSheetByName('Cocktails');
  if (!sh) throw new Error("Sheet 'Cocktails' not found.");
  var row = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var map = {}, dupes = [];
  for (var i = 0; i < row.length; i++){
    var h = String(row[i] == null ? '' : row[i]).trim();
    if (!h) continue;
    if (map.hasOwnProperty(h)) dupes.push(h);
    map[h] = i + 1;
  }
  if (dupes.length) throw new Error('Duplicate header(s) in Cocktails row 1: ' + dupes.join(', ')
    + '. Header lookup needs unique names.');
  _CODEX_HDR = map;
  return map;
}

/** 1-based column index for a header. Throws if the header is missing, which is
 *  deliberate — failing loudly beats reading the wrong column. */
function COL(header){
  var m = codexHeaderMap_();
  if (!m.hasOwnProperty(header)) {
    throw new Error("Column '" + header + "' not found in Cocktails row 1. "
      + 'Available: ' + Object.keys(m).join(' | '));
  }
  return m[header];
}

/** 0-based offset for reading out of a getValues() row that started at column A. */
function IDX(header){ return COL(header) - 1; }

/** Resolved ingredient columns: [{col, idx, header, cat}, ...], skipping any
 *  group whose header does not exist yet (so adding 'Muddled' to
 *  CODEX_ING_GROUPS before creating the column is harmless). */
function codexIngCols_(){
  var m = codexHeaderMap_(), out = [];
  for (var i = 0; i < CODEX_ING_GROUPS.length; i++){
    var h = CODEX_ING_GROUPS[i][0], cat = CODEX_ING_GROUPS[i][1];
    if (m.hasOwnProperty(h)) out.push({col: m[h], idx: m[h] - 1, header: h, cat: cat});
  }
  return out;
}

/** Sanity check — run this from the editor after any column change.
 *  Reports where every field resolved to, so a shift shows up immediately. */
function codexCheckColumns(){
  var names = ['Style','Name','Served','Garnish/Comments','Source','YT_Description',
               'Mood','Season','Holiday','Family','Era'];
  var lines = ['FIELD COLUMNS'];
  for (var i = 0; i < names.length; i++){
    try { lines.push('  ' + names[i] + '  ->  col ' + COL(names[i])); }
    catch (e) { lines.push('  ' + names[i] + '  ->  MISSING'); }
  }
  lines.push('', 'INGREDIENT COLUMNS (card order)');
  var ing = codexIngCols_();
  for (var j = 0; j < ing.length; j++){
    lines.push('  ' + ing[j].header + '  ->  col ' + ing[j].col + '   [' + ing[j].cat + ']');
  }
  var missing = CODEX_ING_GROUPS.filter(function(g){ return !codexHeaderMap_().hasOwnProperty(g[0]); });
  if (missing.length) lines.push('', 'declared but not in the sheet yet: '
    + missing.map(function(g){ return g[0]; }).join(', '));
  var msg = lines.join('\n');
  Logger.log(msg);
  SpreadsheetApp.getUi().alert('Codex — column check', msg, SpreadsheetApp.getUi().ButtonSet.OK);
}


/* ── LINKS: strip the link, keep the line ────────────────────────────────────
 * Shared by BuildAmounts (cleanLines) and CleanDescriptions (cleanFormat_).
 * Both used to DROP any line containing a URL, which silently deleted ingredient
 * lines like "2 oz Haitian Rum (Barbancourt white - https://bit.ly/3EgC0Cl)".
 * Grenadine and St. Germain went missing most often because creators link those
 * bottles. Now only the link goes:
 *   "0.5 oz grenadine (Liber & Co - https://amzn.to/x)" -> "0.5 oz grenadine (Liber & Co)"
 *   "Shop the bar tools: https://kit.co/foo"            -> "Shop the bar tools"
 *   "https://bit.ly/xyz"                                -> ""   (caller drops it)
 * A line with no link is returned byte-for-byte unchanged. Bare domains are only
 * matched with a dot directly between word characters, so "St. Germain", "e.g.",
 * "Liber & Co." and "0.75 oz" are never mistaken for links. */
var LINK_TLDS_ = 'com|net|org|co|ly|to|io|me|us|uk|ca|au|de|shop|store|link|gl|gg|app|bar|cc|tv|page';
// A link ends at whitespace or a closing bracket, so "(Vida - https://bit.ly/x)" keeps its ")".
var LINK_RE_ = new RegExp('(?:https?:\\/\\/|www\\.)[^\\s)\\]]+'
  + '|\\b[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9-]+)*\\.(?:' + LINK_TLDS_ + ')\\b(?:\\/[^\\s)\\]]*)?', 'ig');
function stripLinks_(s){
  s = String(s == null ? '' : s);
  var t = s.replace(LINK_RE_, ' ');
  if (t === s) return s;
  return t
    .replace(/\s*[-\u2013\u2014:|,;]+\s*\)/g, ')')     // "(Barbancourt white - )" -> "(Barbancourt white)"
    .replace(/\(\s*[-\u2013\u2014:|,;]+\s*/g, '(')     // "( - Barbancourt)"       -> "(Barbancourt)"
    .replace(/\(\s*\)|\[\s*\]/g, ' ')                  // aside that was only a link
    .replace(/\s*[-\u2013\u2014:|,;]+\s*$/, '')          // trailing "Grenadine -"
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/* ── PUNCH BOWLS: how many glasses a punch makes ──────────────────────────────
 * The app shows a One glass / The bowl toggle for any drink with a bowl size. The
 * recipe itself is stored single-serve like everything else; the bowl button just
 * scales it up. Sizes come from, in order:
 *   1. CODEX_SERVES below -- yours to set or override, by drink name.
 *   2. The description: "Serves 8", "Yield: 8 servings", "Makes 12 drinks", "10
 *      servings". Checked in the original (cell note) first, then the cleaned text.
 *      Only for Style = Punch -- not the name, since plenty of single drinks are
 *      called Punch -- so a regular cocktail never grows a bowl button.
 * Publish logs every bowl it found and where from (View > Logs / Executions). */
var CODEX_SERVES = {
  'Harvest Moon Punch': 12,
  'Rum Punch': 4,
  'Wassail': 8,
  'Boathouse Punch': 24,
  'Breezeway Bowl': 2,
  'Scorpion Bowl': 4,
  'Hoist the Colors': 3      // stored as the D&C batch / 3, so the bowl = the book's punch
};
var CODEX_SERVES_RE = [
  // "Servings: 8" / "Serves: 8" / "Serves 8" / "Servings 8 to 10" -- label first, count after.
  // Food & Wine (and most recipe sites) print it this way on the recipe card.
  /\bserv(?:es|ings?)\s*:?\s*(?:about\s*|up to\s*)?(\d{1,2})\b/i,
  /\byields?\s*:?\s*(?:about\s*)?(\d{1,2})\s*(?:(?:to|-|–)\s*\d{1,2}\s*)?(?:servings?|drinks?|cocktails?|glasses|cups|people|portions|punch(?:es)?)?\b/i,
  /\bmakes\s*:?\s*(?:about\s*)?(\d{1,2})\s*(?:(?:to|-|–)\s*\d{1,2}\s*)?(?:servings?|drinks?|cocktails?|glasses|punch(?:es)?|people|portions)\b/i,
  /\b(\d{1,2})\s*(?:(?:to|-|–)\s*\d{1,2}\s*)?(?:servings|portions)\b/i
];
function codexServes_(name, style, note, text){
  if (CODEX_SERVES.hasOwnProperty(name)) return {n: CODEX_SERVES[name], from: 'Config.gs'};
  // Style is the only gate: plenty of drinks are NAMED punch (Planter's, Pisco, Jasper's)
  // without being one, so the name is not trusted.
  if (!/^punch$/i.test(String(style).trim())) return {n: 0};
  var srcs = [note, text];
  for (var s = 0; s < srcs.length; s++){
    var t = String(srcs[s] || ''); if (!t) continue;
    for (var i = 0; i < CODEX_SERVES_RE.length; i++){
      var m = t.match(CODEX_SERVES_RE[i]);
      if (m){ var n = parseInt(m[1], 10); if (n >= 2 && n <= 60) return {n: n, from: 'description: "' + m[0].trim() + '"'}; }
    }
  }
  return {n: 0};
}


/* Run from the script editor (not on the menu): lists every Style = Punch drink with the
   bowl size Publish would give it and where that came from.

   For a punch with no stated yield, it WORKS ONE OUT: the description usually still lists
   the batch ("8 oz rum, 4 oz lime...") while the RC tab holds your single-serve amounts.
   If the ingredients it can match all scale by about the same factor, that factor is the
   bowl size. Those come out as ready-to-paste CODEX_SERVES lines at the bottom of the
   report -- nothing is changed until you paste them in. */
function checkPunchBowls(){
  var ss = SpreadsheetApp.getActive(), cs = ss.getSheetByName('Cocktails'), last = cs.getLastRow();
  var nm = cs.getRange(2, COL('Name'), last-1, 1).getValues(), st = cs.getRange(2, COL('Style'), last-1, 1).getValues();
  var dc = COL('YT_Description'), dv = cs.getRange(2, dc, last-1, 1).getValues(), dn = cs.getRange(2, dc, last-1, 1).getNotes();
  var ING = codexIngCols_(), wide = ING.reduce(function(m, g){ return Math.max(m, g.col); }, 1);
  var iv = cs.getRange(2, 1, last-1, wide).getValues();
  var allNames = nm.map(function(r){ return String(r[0] || '').trim(); }).filter(String);
  var rc = {}, rs = ss.getSheetByName(RC_TAB), rl = rs.getLastRow();   // single-serve amounts, by key
  if (rl >= 2) rs.getRange(2, 1, rl-1, 6).getValues().forEach(function(r){ if (r[0]) rc[String(r[0])] = [r[4], String(r[5] || '')]; });

  var out = [], paste = [];
  for (var i = 0; i < nm.length; i++){
    var n = String(nm[i][0] || '').trim(), s = String(st[i][0] || '');
    if (!n || (!/^punch$/i.test(s.trim()) && !CODEX_SERVES.hasOwnProperty(n))) continue;
    var r = codexServes_(n, s, dn[i][0], dv[i][0]);
    if (r.n){ out.push([n, r.n, r.from]); continue; }
    var g = cpbInfer_(n, iv[i], ING, String(dn[i][0] || '') || String(dv[i][0] || ''), allNames, rc);
    if (g.n){ out.push([n, g.n + ' (suggested)', g.why]); paste.push("  '" + n.replace(/'/g, "\\'") + "': " + g.n + ","); }
    else out.push([n, '', g.why]);
  }
  out.sort(function(a, b){ return (a[1] ? 1 : 0) - (b[1] ? 1 : 0) || a[0].localeCompare(b[0]); });
  var none = out.filter(function(x){ return !x[1]; }).length;
  if (paste.length){ out.push(['', '', ''], ['PASTE INTO CODEX_SERVES (Config.gs):', '', '']); paste.forEach(function(l){ out.push([l, '', '']); }); }
  bShowReport_('Punch bowls', none + ' punch(es) with no bowl size; ' + paste.length
    + ' worked out from the description (ready to paste at the bottom).', ['Drink', 'Serves', 'From / why not'], out);
}

/* Bowl size = batch amount in the description / single-serve amount on RC. Reads the
   description with the same recipe-block picker and ingredient library as Build Amounts. */
function cpbInfer_(name, row, ING, desc, allNames, rc){
  if (!desc || desc.length < 10) return {n: 0, why: 'no description'};
  var ings = [];
  ING.forEach(function(g){ var v = row[g.idx]; if (v !== '' && v != null && String(v).trim()) ings.push(String(v).trim()); });
  var pick = recipeLinesFor_(cleanLines(desc), name, ings, allNames);
  if (!pick.lines) return {n: 0, why: 'could not find the recipe in the description (' + (pick.why || 'no block') + ')'};
  var segs = buildSegments(pick.lines.filter(function(l){ return String(l).trim(); }));
  var distinct = ings.filter(function(x, k){ return ings.indexOf(x) === k; });
  var ratios = [], seen = {};
  ings.forEach(function(ing){
    var o = (seen[ing] || 0); seen[ing] = o + 1;
    var key = o ? name + '|' + ing + '|' + (o + 1) : name + '|' + ing, one = rc[key];
    if (!one || typeof one[0] !== 'number') return;
    var c = segs.filter(function(sg){ return ingWinners_(sg.text, distinct).indexOf(ing) > -1; });
    var sg = c[o] || c[0]; if (!sg) return;
    var big = bPunchOz_(sg.amt, sg.unit), small = bPunchOz_(one[0], one[1]);
    if (big > 0 && small > 0) ratios.push(big / small);
  });
  if (ratios.length < 2) return {n: 0, why: 'description amounts did not line up with enough ingredients to tell'};
  ratios.sort(function(a, b){ return a - b; });
  var med = ratios[Math.floor(ratios.length / 2)], fmt = function(x){ return Math.round(x * 10) / 10; };
  var agree = ratios.filter(function(x){ return Math.abs(x - med) / med <= 0.15; }).length;
  if (med < 1.8) return {n: 0, why: 'description looks single-serve already (about x' + fmt(med) + ')'};
  if (agree < Math.max(2, Math.ceil(ratios.length * 0.7))) return {n: 0, why: 'ingredients scale unevenly (x' + ratios.map(fmt).join(', x') + ') -- check by hand'};
  return {n: Math.round(med), why: 'worked out: ' + agree + ' of ' + ratios.length + ' ingredients scale about x' + fmt(med) + ' from the description to the RC amounts'};
}