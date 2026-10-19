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