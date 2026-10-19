/**
 * DescriptionSplitAudit.gs  — READ-ONLY. Writes one tab ("Desc Review"), touches nothing else.
 *
 * WHY THIS EXISTS
 * CleanDescriptions keeps a line if it has a measurement OR an ingredient the drink has.
 * In a description holding several recipes, that rule keeps every recipe's measurement
 * lines and drops their name headers (a header has neither). The result is one block of
 * all the recipes' ingredients with nothing marking where one ends -- and BuildAmounts
 * parsing that block can pick up another recipe's Lime Juice. No error anywhere.
 *
 * WHAT IT DOES
 * For every drink it reads the ORIGINAL description (the cell note the cleaner saved,
 * else the cell value), splits it into recipe blocks at header lines, picks the block
 * that belongs to this drink (title match + ingredient overlap), and compares that
 * block's amounts with the amounts actually published in codexdata.js.
 *
 * RISK TIERS
 *   DATA  a Name cell holding more than a name (a pasted recipe) -- fix first, it breaks keys
 *   HIGH  confident block match AND a published amount disagrees with it
 *   CHECK an amount disagrees, but the block choice itself is uncertain (close call,
 *         weak title match, or the block is headed by a different codex drink) --
 *         look before trusting the suggested fix
 *   (MED / LOW -- amounts agree -- are counted in the summary but not listed, so the
 *    tab holds only rows to act on: one per wrong amount, with a link to its cell.)
 *   LOW   one recipe, but the source URL is shared with other drinks
 * Rows with one recipe and no shared source aren't listed.
 *
 * Run: auditMultiRecipeDescriptions()
 */

// Header names are matched case-insensitively against row 1 of the Cocktails tab.
// First candidate found wins. Adjust if your headers differ.
var DSA_TAB = 'Cocktails';
var DSA_HEADERS = {
  name: ['Name', 'Cocktail', 'Cocktail Name', 'Drink', 'Drink Name', 'Recipe'],
  desc: ['Description', 'Desc', 'Video Description', 'Recipe Text', 'Notes'],
  src:  ['Source', 'Source URL', 'Link', 'URL', 'Video', 'Video Link']
};
var DSA_DATA_URL = 'https://raw.githubusercontent.com/awgermain/codex/main/codexdata.js';
var DSA_OUT = 'Desc Review';

function auditMultiRecipeDescriptions() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(DSA_TAB);
  // Find the header row rather than assuming row 1 (a title or banner row above the
  // table would push it down), then match each header exactly first, loosely second.
  var lastCol = sh.getLastColumn();
  var top = sh.getRange(1, 1, Math.min(6, sh.getLastRow()), lastCol).getValues();
  var hRow = 0, head = null;
  for (var r = 0; r < top.length && !head; r++) {
    var h = top[r].map(function (x) { return String(x).trim().toLowerCase(); });
    if (dsaPick_(h, DSA_HEADERS.name) > -1 && dsaPick_(h, DSA_HEADERS.desc) > -1) { head = h; hRow = r; }
  }
  if (!head) {
    var seen = top[0].map(function (x) { return String(x).trim(); }).filter(String);
    throw new Error('Could not find the Name and Description headers in the first 6 rows of "' + DSA_TAB
      + '". Row 1 headers are: ' + seen.join(' | ') + '. Add the right names to DSA_HEADERS.');
  }
  var cName = dsaPick_(head, DSA_HEADERS.name), cDesc = dsaPick_(head, DSA_HEADERS.desc), cSrc = dsaPick_(head, DSA_HEADERS.src);
  var first = hRow + 2;   // first data row, 1-based
  var n = sh.getLastRow() - first + 1;
  var names = sh.getRange(first, cName + 1, n, 1).getValues();
  var descR = sh.getRange(first, cDesc + 1, n, 1);
  var vals = descR.getValues(), notes = descR.getNotes();
  // Source cells are usually rich-text links whose visible text is the creator's name,
  // so read the LINK, not the value (the value would group drinks by creator). Same
  // three places urlFromCell_ looks: rich-text runs, a HYPERLINK() formula, a bare URL.
  var srcs = null;
  if (cSrc > -1) {
    var sr = sh.getRange(first, cSrc + 1, n, 1);
    var rt = sr.getRichTextValues(), fm = sr.getFormulas(), fv = sr.getValues(), found = 0;
    srcs = rt.map(function (r, i) {
      var u = '', v = r[0];
      if (v) { v.getRuns().some(function (x) { u = x.getLinkUrl() || ''; return !!u; }); if (!u) u = v.getLinkUrl() || ''; }
      if (!u) { var hm = String(fm[i][0] || '').match(/HYPERLINK\(\s*"([^"]+)"/i); if (hm) u = hm[1]; }
      if (!u && /^https?:\/\//i.test(String(fv[i][0]).trim())) u = String(fv[i][0]).trim();
      if (u) found++;
      return [u];
    });
    if (found < n * 0.3) srcs = null;   // not a link column after all: skip the shared-source check
  }

  // Published amounts: what the app actually shows. Reading them from the payload means
  // this script needs no knowledge of the RC tab's layout.
  var pub = {};
  try {
    var txt = UrlFetchApp.fetch(DSA_DATA_URL, { muteHttpExceptions: true }).getContentText();
    var json = JSON.parse(txt.replace(/^\s*window\.CODEX_DATA\s*=\s*/, '').replace(/;\s*$/, ''));
    json.cocktails.forEach(function (d) { pub[d.n.trim().toLowerCase()] = d; });
  } catch (e) { Logger.log('Could not read codexdata.js; amount comparison skipped: ' + e); }

  // Other drink names, for spotting a block headed by a different drink.
  var allNames = names.map(function (r) { return String(r[0]).trim(); }).filter(String);

  // Shared sources.
  var bySrc = {};
  if (srcs) srcs.forEach(function (r, i) {
    var k = dsaNormUrl_(r[0]); if (!k) return; (bySrc[k] = bySrc[k] || []).push(String(names[i][0]).trim());
  });

  // The RC tab, so each mismatch can show what's there now and link straight to it.
  var rcByKey = {}, rcSheet = null, rcAmtCol = 0, rcUrl = ss.getUrl();
  try {
    rcSheet = ss.getSheetByName(typeof RC_TAB !== 'undefined' ? RC_TAB : 'RC - AmountIndex');
    if (rcSheet && rcSheet.getLastRow() > 1) {
      var rh = rcSheet.getRange(1, 1, 1, rcSheet.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
      var cK = rh.indexOf('Key'), cA = rh.indexOf('Amount'), cU = rh.indexOf('Unit'), cS = rh.indexOf('Source');
      if (cK > -1 && cA > -1) {
        rcAmtCol = cA + 1;
        rcSheet.getRange(2, 1, rcSheet.getLastRow() - 1, rh.length).getValues().forEach(function (r, j) {
          var k = String(r[cK]).trim(); if (k) rcByKey[k] = { row: j + 2, amt: r[cA], unit: cU > -1 ? r[cU] : '', src: cS > -1 ? r[cS] : '' };
        });
      }
    }
  } catch (e) { Logger.log('Desc Review: could not read the RC tab: ' + e); }
  function colA1(c) { var t = ''; while (c > 0) { var m = (c - 1) % 26; t = String.fromCharCode(65 + m) + t; c = (c - m - 1) / 26; } return t; }

  var out = [], counts = { MED: 0, LOW: 0 };
  for (var i = 0; i < n; i++) {
    var name = String(names[i][0]).trim(); if (!name) continue;
    var original = String(notes[i] || vals[i][0] || '');
    var current = String(vals[i][0] || '');
    var d = pub[name.toLowerCase()];
    var ings = d ? d.i.map(function (x) { return { n: x[0], q: x[1], u: x[2] }; }) : [];
    var shared = [];
    if (srcs) { var k = dsaNormUrl_(srcs[i][0]); if (k && bySrc[k].length > 1) shared = bySrc[k].filter(function (x) { return x !== name; }); }

    var blocks = dsaBlocks_(original);
    var recipes = blocks.filter(function (b) { return b.meas.length >= 2; });
    if (!recipes.length) continue;

    // Choose this drink's block.
    var scored = recipes.map(function (b) { return { b: b, s: dsaScore_(b, name, ings, allNames) }; })
                        .sort(function (a, b) { return b.s - a.s; });
    var best = scored[0], second = scored[1];
    var margin = best && second ? best.s - second.s : (best ? best.s : 0);
    var otherOwner = best ? dsaOtherOwner_(best.b.title, name, allNames) : '';
    var conf = !best ? '' : otherOwner ? 'belongs to ' + otherOwner
             : best.s < 1 ? 'weak match'
             : (recipes.length < 2 ? 'only block' : margin >= 2 ? 'clear' : margin >= 0.75 ? 'likely' : 'close call');

    // Compare the chosen block with the published amounts. Rows sharing an ingredient
    // name (two "Rum" rows) are compared as a set against every rum line in the block,
    // and a line offering alternatives ("2 barspoons honey or 1/2 oz honey syrup")
    // matches if ANY of its amounts agrees.
    var mism = [], fixes = [];
    if (best && ings.length) {
      var groups = {};
      ings.forEach(function (ing) { var k = ing.n.toLowerCase(); (groups[k] = groups[k] || []).push(ing); });
      Object.keys(groups).forEach(function (k) {
        var rows = groups[k], lines = dsaLinesFor_(best.b.meas, rows[0].n);
        if (!lines.length) return;
        var opts = lines.map(function (l) { return { l: l, q: dsaQtys_(l), used: false }; }).filter(function (o) { return o.q.some(function (x) { return x.oz != null; }); });
        if (!opts.length) return;
        rows.forEach(function (ing, occ) {
          var pubOz = dsaToOz_(ing.q, ing.u); if (pubOz == null) return;
          var hit = opts.filter(function (o) { return !o.used && o.q.some(function (x) { return x.oz != null && Math.abs(x.oz - pubOz) <= 0.13; }); })[0];
          if (hit) { hit.used = true; return; }
          var free = opts.filter(function (o) { return !o.used; });
          // More published rows than matching lines (three "Rum" rows, but one rum
          // line says "light Puerto Rican" without the word rum): can't tell which is
          // which, so say nothing rather than flag a row that's probably fine.
          if (!free.length) return;
          var say = free.map(function (o) { return o.q[0].raw; }).join(' or ');
          var fix = '';
          if (rows.length === 1 && opts.length === 1) {
            var oz = opts[0].q.filter(function (x) { return x.oz != null; })[0].oz;
            fix = dsaFmtFix_(oz, ing.u, opts[0].q[0]);
          }
          // the same key BuildAmounts writes: Drink|Ingredient, then |2, |3 for repeats
          mism.push({ ing: ing.n, key: name + '|' + ing.n + (occ ? '|' + (occ + 1) : ''), pub: ing.q + ' ' + ing.u, say: say, fix: fix });
        });
      });
    }

    // Does the current cell hold lines from more than one recipe block?
    var curLines = current.split(/\r?\n/).map(dsaNormLine_).filter(String);
    var touched = recipes.filter(function (b) { return b.meas.some(function (m) { return curLines.indexOf(dsaNormLine_(m)) > -1; }); }).length;
    var smashed = recipes.length >= 2 && touched >= 2;

    // One recipe, unshared source, and it's this drink's own: nothing here for this
    // review (a single-recipe amount that differs is a deliberate edit as often as not).
    // Kept only if that one block is headed by a DIFFERENT drink -- a clipped or wrong
    // description, like Linden Square's, which ends before its own recipe starts.
    if (recipes.length < 2 && !shared.length && !otherOwner) continue;
    var sure = conf === 'clear' || conf === 'likely' || conf === 'only block';
    if (!sure) mism.forEach(function (m) { m.fix = ''; });   // a fix read from the wrong recipe would make things worse
    var risk = otherOwner ? 'CHECK'
             : mism.length ? (sure && recipes.length >= 2 ? 'HIGH' : 'CHECK')
             : recipes.length < 2 ? 'LOW'
             : (smashed || conf === 'close call') ? 'MED' : 'LOW';

    // Only rows you can act on are listed: one per wrong amount, with a link to the
    // exact Amount cell. Drinks whose amounts are fine are just counted.
    if (risk === 'MED' || risk === 'LOW') { counts[risk]++; continue; }
    var blockText = best ? best.b.lines.join('\n') : '';
    var blockName = best ? (best.b.title || '(untitled)') : '';
    if (!mism.length) {
      out.push([risk, name, '', '', '', '', '', '', conf, blockName, blockText]);
      continue;
    }
    mism.forEach(function (m) {
      var rc = rcByKey[m.key], link = '', now = m.pub, src = '';
      if (rc) {
        now = rc.amt + (rc.unit ? ' ' + rc.unit : ''); src = rc.src;
        var a1 = colA1(rcAmtCol) + rc.row;
        link = '=HYPERLINK("' + rcUrl + '#gid=' + rcSheet.getSheetId() + '&range=' + a1 + '","' + a1 + ' \u2197")';
      } else src = 'not found';
      out.push([risk, name, m.ing, now, src, m.say, m.fix, link, conf, blockName, blockText]);
    });
  }

  // A Name cell with a line break holds more than a name -- usually a pasted recipe.
  // It breaks the Name|Ingredient key, so it's listed first.
  names.forEach(function (r) { var v = String(r[0]); if (/\n/.test(v.trim())) out.push(['DATA', v.split(/\n/)[0].trim(), '', '', '', 'Name cell contains a line break (pasted recipe?): ' + v.replace(/\s+/g, ' ').slice(0, 120), '', '', '', '', '']); });
  var order = { DATA: 0, HIGH: 1, CHECK: 2, MED: 3, LOW: 4 };
  out.sort(function (a, b) { return order[a[0]] - order[b[0]] || a[1].localeCompare(b[1]) || String(a[2]).localeCompare(String(b[2])); });

  var o = ss.getSheetByName(DSA_OUT) || ss.insertSheet(DSA_OUT);
  o.clear();
  var hdr = ['Risk', 'Drink', 'Ingredient', 'Amount now', 'Source', 'Recipe says', 'Suggested fix',
             'Go to cell', 'Match confidence', 'Matched recipe', 'Recipe text'];
  o.getRange(1, 1, 1, hdr.length).setValues([hdr]).setFontWeight('bold');
  if (out.length) o.getRange(2, 1, out.length, hdr.length).setValues(out).setVerticalAlignment('top');
  o.setFrozenRows(1);
  o.setColumnWidth(6, 200); o.setColumnWidth(10, 240); o.setColumnWidth(11, 320);
  o.getRange(2, 11, Math.max(out.length, 1), 1).setWrap(true);
  var c = { DATA: 0, HIGH: 0, CHECK: 0, MED: counts.MED, LOW: counts.LOW };
  var drinks = {}; out.forEach(function (r) { if (!drinks[r[0] + '|' + r[1]]) { drinks[r[0] + '|' + r[1]] = 1; c[r[0]]++; } });
  // getUi() only works when run from the sheet (menu/button). From the script editor
  // it throws, so fall back to a toast and the execution log.
  var msg = 'Desc Review: ' + (c.DATA ? c.DATA + ' data, ' : '') + c.HIGH + ' high, ' + c.CHECK + ' to check (drinks). '
    + (c.MED + c.LOW) + ' multi-recipe drinks have correct amounts and are not listed.';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { ss.toast(msg, 'Desc Review', 10); }
}

/* ---------- helpers ---------- */

// Exact header match first; then a header that CONTAINS a candidate ("Cocktail Name"
// for "name", "YT Description" for "description"). Exact always wins.
function dsaPick_(head, cands) {
  for (var i = 0; i < cands.length; i++) { var k = head.indexOf(cands[i].toLowerCase()); if (k > -1) return k; }
  for (var j = 0; j < cands.length; j++) {
    var c = cands[j].toLowerCase(); if (c.length < 4) continue;
    for (var m = 0; m < head.length; m++) if (head[m] && head[m].indexOf(c) > -1) return m;
  }
  return -1;
}

// Parsing helpers (blocks, scoring, quantities) live in RecipeBlocks.gs, shared with BuildAmounts.