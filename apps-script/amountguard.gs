/**
 * Cocktail Codex — Amount guard  (v2, hardened)
 * ---------------------------------------------
 * When you hand-edit an Amount or a Unit on the master table (RC_TAB), this flips
 * that row's Source to "manual", so `buildAmounts` will never regenerate over your
 * correction. A conditional-formatting rule on Source="manual" handles the colour.
 *
 * This is a SIMPLE trigger: it fires on edits YOU make, and never on script writes.
 * That is exactly why a parser rebuild doesn't flag rows but your typing does.
 *
 * IMPORTANT: a project can have only ONE onEdit. If you add another one anywhere,
 * merge its body into this function instead of pasting a second onEdit.
 *
 * ----------------------------------------------------------------------------
 * v2 — four changes, all robustness. Behaviour on a normal single-cell edit is
 * identical to v1.
 *
 * 1) COLUMNS RESOLVE BY HEADER, not by number.
 *    v1 hardcoded Amount=5, Unit=6, Source=8. It was the last script in the
 *    project still doing that. Insert a column into RC_TAB and v1 would quietly
 *    start stamping "manual" into the wrong field — no error, just wrong data,
 *    which is the exact failure COL() exists to prevent. COL() itself only maps
 *    'Cocktails', so this uses a small RC-specific equivalent below.
 *
 * 2) CLEARING AN AMOUNT NO LONGER LOCKS THE ROW.
 *    v1 flagged manual on ANY edit to Amount/Unit, including deleting the value.
 *    Since buildAmounts preserves manual rows, a cleared amount became a
 *    permanently blank protected row the parser could never refill. Now an edit
 *    that leaves Amount empty is left alone — so clearing a cell is how you hand
 *    a row back to the parser.
 *
 * 3) BATCHED WRITE.
 *    v1 called setValue() once per row inside a loop. Paste 300 rows and that is
 *    300 round trips inside a trigger with a hard time limit. Now it reads the
 *    Source column once and writes back once.
 *
 * 4) FAILURES ARE VISIBLE.
 *    v1's catch block was empty, so if this ever stopped working you would get no
 *    signal — you would just find rows quietly unprotected later. It still never
 *    blocks your edit, but it now logs and toasts.
 * ----------------------------------------------------------------------------
 */

/** Header -> 1-based column on RC_TAB. Cached for the life of the execution.
 *  Deliberately mirrors codexHeaderMap_() in Config.gs, but for the amounts tab. */
var _RC_HDR = null;
function rcHeaderMap_(sh){
  if (_RC_HDR) return _RC_HDR;
  var row = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var map = {};
  for (var i = 0; i < row.length; i++){
    var h = String(row[i] == null ? '' : row[i]).trim();
    if (h && !map.hasOwnProperty(h)) map[h] = i + 1;
  }
  _RC_HDR = map;
  return map;
}

/** 1-based column for a header on RC_TAB. Throws if missing; the caller turns
 *  that into a visible toast rather than silence. */
function RCCOL_(sh, header){
  var m = rcHeaderMap_(sh);
  if (!m.hasOwnProperty(header)){
    throw new Error("AmountGuard: column '" + header + "' not found in " + RC_TAB
      + " row 1. Found: " + Object.keys(m).join(' | '));
  }
  return m[header];
}

function onEdit(e){
  try{
    if(!e || !e.range) return;
    var sh = e.range.getSheet();
    if(sh.getName() !== RC_TAB) return;

    var cAmt = RCCOL_(sh, 'Amount'), cUnit = RCCOL_(sh, 'Unit'), cSrc = RCCOL_(sh, 'Source');
    var lo = Math.min(cAmt, cUnit), hi = Math.max(cAmt, cUnit);

    // did this edit touch Amount or Unit at all?
    var c = e.range.getColumn(), nc = e.range.getNumColumns();
    if((c + nc - 1) < lo || c > hi) return;

    var r = e.range.getRow(), nr = e.range.getNumRows();
    if(r + nr - 1 < 2) return;                     // header-only edit
    var start = Math.max(r, 2);
    var count = (r + nr - 1) - start + 1;
    if(count < 1) return;

    // read Amount and Source for the affected rows in one go
    var amts = sh.getRange(start, cAmt, count, 1).getValues();
    var srcs = sh.getRange(start, cSrc, count, 1).getValues();

    var touched = false;
    for(var i = 0; i < count; i++){
      var amt = amts[i][0];
      // An empty Amount means the row is being handed BACK to the parser.
      // Flagging it manual here is what used to strand rows permanently blank.
      if(amt === '' || amt === null) continue;
      if(String(srcs[i][0]).trim().toLowerCase() === 'manual') continue;   // already protected
      srcs[i][0] = 'manual';
      touched = true;
    }
    if(touched) sh.getRange(start, cSrc, count, 1).setValues(srcs);

  }catch(err){
    // Never block an edit — but never fail silently either.
    try{
      Logger.log('AmountGuard failed: ' + err);
      SpreadsheetApp.getActive().toast('AmountGuard did not run: ' + err.message
        + ' — your edit was saved, but Source was not set to "manual".',
        'Cocktail Codex', 10);
    }catch(ignored){}
  }
}