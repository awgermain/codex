/**
 * Cocktail Codex — Fetch YouTube descriptions
 * -------------------------------------------------
 * Reads the Source column on the "Cocktails" sheet, extracts a YouTube
 * video ID from each link (watch?v=, youtu.be/, or /shorts/), fetches the
 * full description via the YouTube Data API, and writes it to a target
 * column. Non-YouTube links (Liber, Reddit, Instagram, etc.) are skipped.
 *
 * SETUP (one time):
 *   1. Extensions > Apps Script  → paste this file in.
 *   2. In the editor, click "Services" (＋ icon), add "YouTube Data API v3".
 *   3. Run fetchYouTubeDescriptions() once and approve the auth prompt.
 *   A "Cocktail Codex" menu also appears in the sheet after a reload.
 *
 * Quota: videos.list costs 1 unit per 50 IDs. ~686 videos ≈ 14 units.
 * Daily free quota is 10,000, so this is trivial and rerunnable.
 */

// ---- CONFIG ---------------------------------------------------------------
var SHEET_NAME   = 'Cocktails';
var SOURCE_COL   = COL('Source');            // resolved by header, see Config.gs
var TARGET_COL   = COL('YT_Description');    // resolved by header
var TARGET_HEADER = 'YT_Description';
var HEADER_ROW   = 1;
var FIRST_DATA_ROW = 2;
var ONLY_FILL_BLANKS = true;  // true = don't overwrite descriptions already fetched
// ---------------------------------------------------------------------------

function extractVideoId_(url) {
  if (!url) return null;
  var m;
  m = url.match(/[?&]v=([A-Za-z0-9_-]{11})/);            if (m) return m[1];
  m = url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);       if (m) return m[1];
  m = url.match(/\/shorts\/([A-Za-z0-9_-]{11})/);        if (m) return m[1];
  m = url.match(/\/embed\/([A-Za-z0-9_-]{11})/);         if (m) return m[1];
  return null;
}

// Pull the underlying URL whether the cell is a rich-text link, a
// HYPERLINK() formula, or a bare URL string.
function urlFromCell_(range) {
  var rtv = range.getRichTextValue();
  if (rtv) {
    var runs = rtv.getRuns();
    for (var i = 0; i < runs.length; i++) {
      var link = runs[i].getLinkUrl();
      if (link) return link;
    }
    var whole = rtv.getLinkUrl();
    if (whole) return whole;
  }
  var f = range.getFormula();
  if (f) {
    var hm = f.match(/HYPERLINK\(\s*"([^"]+)"/i);
    if (hm) return hm[1];
  }
  var v = range.getValue();
  if (typeof v === 'string' && /^https?:\/\//.test(v)) return v;
  return null;
}

function fetchYouTubeDescriptions() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) { throw new Error('Sheet "' + SHEET_NAME + '" not found.'); }

  var lastRow = sh.getLastRow();
  var n = lastRow - FIRST_DATA_ROW + 1;
  if (n <= 0) { return; }

  sh.getRange(HEADER_ROW, TARGET_COL).setValue(TARGET_HEADER);

  var srcRange = sh.getRange(FIRST_DATA_ROW, SOURCE_COL, n, 1);
  var existing = sh.getRange(FIRST_DATA_ROW, TARGET_COL, n, 1).getValues();

  // Map each row to a video ID (or null)
  var rowVid = new Array(n);
  var idSet = {};
  for (var i = 0; i < n; i++) {
    if (ONLY_FILL_BLANKS && existing[i][0]) { rowVid[i] = null; continue; }
    var cell = srcRange.getCell(i + 1, 1);
    var id = extractVideoId_(urlFromCell_(cell));
    rowVid[i] = id;
    if (id) idSet[id] = true;
  }

  // Batch-fetch descriptions, 50 IDs per API call
  var ids = Object.keys(idSet);
  var descById = {};
  for (var s = 0; s < ids.length; s += 50) {
    var chunk = ids.slice(s, s + 50);
    var resp = YouTube.Videos.list('snippet', { id: chunk.join(','), maxResults: 50 });
    (resp.items || []).forEach(function (it) {
      descById[it.id] = (it.snippet && it.snippet.description) || '';
    });
  }

  // Write results back
  var out = new Array(n);
  var wrote = 0;
  for (var j = 0; j < n; j++) {
    var vid = rowVid[j];
    if (vid && descById.hasOwnProperty(vid)) { out[j] = [descById[vid]]; wrote++; }
    else { out[j] = [existing[j][0] || '']; }
  }
  sh.getRange(FIRST_DATA_ROW, TARGET_COL, n, 1).setValues(out);

  SpreadsheetApp.getActive().toast(
    'Fetched ' + wrote + ' descriptions across ' + ids.length + ' unique videos.',
    'Cocktail Codex', 6);
}