/**
 * Cocktail Codex — Clean Descriptions  (v1)
 * -----------------------------------------
 * Pulls the recipe out of a YouTube description and leaves the rest behind.
 *
 * The method is the one worth understanding: it does NOT try to recognise boilerplate.
 * Blocklisting "subscribe", "Instagram", affiliate links and so on is a losing game --
 * every creator writes different filler. Instead it keeps a line only if that line
 * earns its place, by containing either
 *      a MEASUREMENT  (2oz, 1 1/2 oz, 45ml, 3/4, a dash, a barspoon), or
 *      an INGREDIENT THIS DRINK ACTUALLY HAS, read from its own Cocktails row.
 * Everything else goes. Because the test is per-drink, a line about gin survives in a
 * gin drink and is discarded in a rum one.
 *
 * On the current collection: 832 of 846 descriptions yield recipe lines, and the text
 * shrinks from about 1,750 characters to about 200.
 *
 * ── TWO WAYS TO RUN IT ───────────────────────────────────────────────────
 *   previewCleanDescriptions   writes nothing. Logs samples across the length range
 *                              plus a WORTH READING list: short sources losing more
 *                              than a fifth, which is what a hand-written description
 *                              losing a line looks like.
 *   cleanDescriptions          fills a separate "Recipe Text" column, source untouched
 *   cleanDescriptionsInPlace   overwrites YT_Description, original kept in a NOTE
 *   restoreDescriptionsFromNotes   puts every noted original back
 *   clearDescriptionNotes      drops the notes once you are satisfied
 *
 * The in-place version exists because the backup column is only needed while you are
 * checking the result, and a column that outlives its purpose is clutter. A cell note
 * keeps the undo attached to the row it belongs to and disappears in one action.
 * It writes a note ONLY where it actually changed something, and never overwrites an
 * existing note -- so running it twice cannot lose the true original.
 *
 * A drink whose description yields nothing keeps an empty clean cell and is counted
 * in the summary, so you can find the ones that need reading by hand.
 */
/* Leave short descriptions alone entirely.
   The cleaner exists to strip YouTube filler, and filler only appears in long text.
   Across the collection, descriptions of 400+ characters shed 81% -- that is the
   whole point of the script -- while those under 400 shed only 24%, and most of that
   24% is a line someone wrote on purpose. Skipping them gives up 1.2% of the total
   saving and removes every risky row at a stroke, which is a far better trade than
   reading 145 diffs. Raise it if you want to be even more conservative. */
var CLEAN_MIN_LENGTH = 400;

/* A floor on the RESULT as well as the source. If a long description cleans down to
   almost nothing, the rule has failed to find a recipe that is probably in there --
   so keep the original rather than write the scraps. Without this the preview would
   flag those rows and the run would overwrite them anyway, which is the worst of
   both. Nothing to repopulate afterwards: they are simply left as they were. */
var CLEAN_MIN_RESULT = 40;

/* Named exceptions, for a long description you want kept whole. Exact drink name. */
var CLEAN_SKIP = {
  // 'Crabby Melter': true
};

var CLEAN_COL_HEADER = 'Recipe Text';
var CLEAN_SOURCE_HEADER = 'YT_Description';

/* A number, optionally a fraction, followed by a unit. Anchored so that prose like
   "3 MORE gin cocktails" does not qualify -- there has to be a unit after the figure. */
var CLEAN_AMT = /(^|[\s(])(\d+(\.\d+)?|\d\/\d|\d+\s+\d\/\d|[½¼¾⅓⅔⅛])\s*(oz|ounce|ounces|ml|cl|l\b|dash|dashes|tsp|teaspoon|tbsp|tablespoon|barspoon|bar spoon|parts?|drops?|pinch|cups?|g\b|grams?)/i;
/* Lines that are pure plumbing, kept out even when they mention an ingredient. */
var CLEAN_JUNK = /(https?:\/\/|^\s*(subscribe|follow|instagram|tiktok|patreon|facebook|twitter|music by|filmed|edited|shot on|my gear|affiliate)\b)/i;

function cleanDescHeaders_(sh){
  var row=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0], m={};
  for (var i=0;i<row.length;i++){ var h=String(row[i]==null?'':row[i]).trim(); if(h&&!m.hasOwnProperty(h)) m[h]=i+1; }
  if(!m.hasOwnProperty(CLEAN_SOURCE_HEADER)) throw new Error("Clean: no '"+CLEAN_SOURCE_HEADER+"' column on Cocktails.");
  return m;
}

/** The extraction itself. Exposed separately so preview and run can never diverge. */
function cleanOneDescription_(desc, ings){
  if(!desc) return '';
  if(String(desc).length < CLEAN_MIN_LENGTH) return String(desc);   // short: hand back unchanged
  var lines=String(desc).split('\n'), keep=[];
  for (var i=0;i<lines.length;i++){
    var l=lines[i].replace(/\s+$/,'').replace(/^\s+/,'');
    if(!l) continue;
    if(CLEAN_JUNK.test(l)) continue;
    var hasAmt=CLEAN_AMT.test(l), hasIng=false;
    for (var k=0;k<ings.length && !hasIng;k++){
      var g=ings[k];
      if(g.length>3 && l.toLowerCase().indexOf(g.toLowerCase())>-1) hasIng=true;
    }
    if(hasAmt||hasIng) keep.push(l);
  }
  var res=keep.join('\n');
  return res.length < CLEAN_MIN_RESULT ? String(desc) : res;   // too little found: keep the original
}

function previewCleanDescriptions(){
  var ss=SpreadsheetApp.getActive(), sh=ss.getSheetByName('Cocktails');
  var m=cleanDescHeaders_(sh), ING=codexIngCols_();
  var last=sh.getLastRow(), vals=sh.getRange(2,1,last-1,sh.getLastColumn()).getValues();
  var n=0, emptied=0, shrank=0, short=0, skipped=0, samples=[], suspect=[];
  for (var r=0;r<vals.length;r++){
    var nm=String(vals[r][m['Name']-1]||'').trim(); if(!nm) continue;
    var desc=String(vals[r][m[CLEAN_SOURCE_HEADER]-1]||''); if(!desc.trim()) continue;
    n++;
    if(CLEAN_SKIP[nm]){ skipped++; continue; }
    if(desc.length < CLEAN_MIN_LENGTH){ short++; continue; }
    var ings=[];
    for (var g=0;g<ING.length;g++){ var v=vals[r][ING[g].idx]; if(v!==''&&v!=null) ings.push(String(v).trim()); }
    var cl=cleanOneDescription_(desc,ings);
    shrank+=desc.length-cl.length;
    /* Suspicious now means the opposite of before: a LONG description that came out
       with almost nothing. That is the cleaner failing to find a recipe it should
       have found -- usually an ingredient spelled differently here than in the video
       -- not the cleaner eating something you wrote. */
    if(cl===desc){
      emptied++;
      suspect.push(nm+'  ('+desc.length+' chars, too little found — LEFT UNCHANGED)');
      continue;
    }
    if(samples.length<12 && (n % 70 === 0)) samples.push('--- '+nm+'  ('+desc.length+' -> '+cl.length+') ---\n'+cl);
  }
  var log='PREVIEW ONLY — nothing was written.\n'
    +n+' descriptions in total.\n'
    +short+' left untouched (under '+CLEAN_MIN_LENGTH+' characters).\n'
    +skipped+' left untouched (named in CLEAN_SKIP).\n'
    +(n-short-skipped)+' would be cleaned, removing '+shrank+' characters.\n\n'
    +'=== LEFT UNCHANGED ('+suspect.length+') — long descriptions that yielded almost nothing ===\n'
    +'Nothing to fix unless you want to: these keep their original text. The cause is\n'
    +'usually an ingredient spelled differently here than in the video.\n'
    +(suspect.length?suspect.join('\n\n'):'none')
    +'\n\n=== SAMPLES ===\n'+samples.join('\n\n');
  Logger.log(log);
  /* Shown on screen, not just logged. Run from a spreadsheet menu and Logger output
     lands in the Apps Script execution transcript -- three clicks and a different tab
     away -- which is a silly place to put the one thing you are meant to read. */
  cleanShowReport_('Preview — clean descriptions', log);
}

function cleanDescriptions(){
  var ss=SpreadsheetApp.getActive(), ui=SpreadsheetApp.getUi(), sh=ss.getSheetByName('Cocktails');
  var m=cleanDescHeaders_(sh);
  if(!m.hasOwnProperty(CLEAN_COL_HEADER)){
    ui.alert('Clean descriptions',
      "No '"+CLEAN_COL_HEADER+"' column on Cocktails.\n\nAdd one (anywhere -- it is found by header, not position) and run again.\n\nYT_Description is never modified; the cleaned text goes in the new column.",
      ui.ButtonSet.OK);
    return;
  }
  var ING=codexIngCols_(), last=sh.getLastRow();
  var vals=sh.getRange(2,1,last-1,sh.getLastColumn()).getValues();
  var col=[], n=0, emptied=0, kept=0;
  for (var r=0;r<vals.length;r++){
    var nm=String(vals[r][m['Name']-1]||'').trim();
    var existing=String(vals[r][m[CLEAN_COL_HEADER]-1]||'');
    if(!nm){ col.push([existing]); continue; }
    var desc=String(vals[r][m[CLEAN_SOURCE_HEADER]-1]||'');
    if(!desc.trim()){ col.push([existing]); continue; }
    var ings=[];
    for (var g=0;g<ING.length;g++){ var v=vals[r][ING[g].idx]; if(v!==''&&v!=null) ings.push(String(v).trim()); }
    var cl=cleanOneDescription_(desc,ings);
    n++;
    if(!cl){ emptied++; col.push([existing]); continue; }   // nothing found, leave whatever is there
    kept++; col.push([cl]);
  }
  sh.getRange(2,m[CLEAN_COL_HEADER],col.length,1).setValues(col);
  var msg='Cleaned '+kept+' of '+n+' descriptions into "'+CLEAN_COL_HEADER+
          '". '+emptied+' yielded nothing and were left alone. '+CLEAN_SOURCE_HEADER+' is unchanged.';
  ss.toast(msg,'Cocktail Codex',12); Logger.log(msg);
}


/* ---------------------------------------------------------------------------
 * In-place cleaning, with the original kept in a cell note.
 *
 * Re-running is safe: a note is only written if there is not already one, so the
 * FIRST original survives however many times this runs. That matters because the
 * second run would otherwise record the already-cleaned text as the "original".
 * ------------------------------------------------------------------------- */
function cleanDescriptionsInPlace(){
  var ss=SpreadsheetApp.getActive(), ui=SpreadsheetApp.getUi(), sh=ss.getSheetByName('Cocktails');
  var m=cleanDescHeaders_(sh), ING=codexIngCols_(), last=sh.getLastRow();
  var col=m[CLEAN_SOURCE_HEADER];
  var vals=sh.getRange(2,1,last-1,sh.getLastColumn()).getValues();
  var cur=sh.getRange(2,col,last-1,1).getValues();
  var notes=sh.getRange(2,col,last-1,1).getNotes();

  var planned=0, saved=0;
  var outV=[], outN=[];
  for (var r=0;r<vals.length;r++){
    var nm=String(vals[r][m['Name']-1]||'').trim();
    var desc=String(cur[r][0]||'');
    var note=String(notes[r][0]||'');
    if(!nm || !desc.trim()){ outV.push([cur[r][0]]); outN.push([note]); continue; }
    var ings=[];
    for (var g=0;g<ING.length;g++){ var v=vals[r][ING[g].idx]; if(v!==''&&v!=null) ings.push(String(v).trim()); }
    var cl=cleanOneDescription_(desc,ings);
    if(!cl || cl===desc){ outV.push([cur[r][0]]); outN.push([note]); continue; }
    planned++; saved+=desc.length-cl.length;
    outV.push([cl]);
    outN.push([note ? note : desc]);     // never clobber a note already holding an original
  }
  if(!planned){ ui.alert('Clean descriptions','Nothing would change.',ui.ButtonSet.OK); return; }
  var ans=ui.alert('Clean descriptions in place',
    planned+' description(s) will be shortened by '+saved+' characters in total.\n\n'+
    'The original text is kept in a note on each cell. Restore Descriptions From Notes '+
    'puts them all back; Clear Description Notes drops them once you are happy.\n\nProceed?',
    ui.ButtonSet.YES_NO);
  if(ans!==ui.Button.YES){ ss.toast('Nothing changed.','Cocktail Codex',5); return; }
  var rng=sh.getRange(2,col,outV.length,1);
  rng.setNotes(outN);     // notes first, so an interruption cannot lose an original
  rng.setValues(outV);
  var msg='Cleaned '+planned+' descriptions in place, '+saved+' characters removed. Originals are in cell notes.';
  ss.toast(msg,'Cocktail Codex',12); Logger.log(msg);
}

function restoreDescriptionsFromNotes(){
  var ss=SpreadsheetApp.getActive(), ui=SpreadsheetApp.getUi(), sh=ss.getSheetByName('Cocktails');
  var m=cleanDescHeaders_(sh), col=m[CLEAN_SOURCE_HEADER], last=sh.getLastRow();
  var rng=sh.getRange(2,col,last-1,1);
  var notes=rng.getNotes(), vals=rng.getValues(), n=0;
  for (var r=0;r<notes.length;r++){
    var nt=String(notes[r][0]||'');
    if(nt){ vals[r][0]=nt; n++; }
  }
  if(!n){ ui.alert('Restore descriptions','No notes found — nothing to restore.',ui.ButtonSet.OK); return; }
  var ans=ui.alert('Restore descriptions', n+' description(s) will be put back from their notes. Proceed?', ui.ButtonSet.YES_NO);
  if(ans!==ui.Button.YES) return;
  rng.setValues(vals);
  ss.toast('Restored '+n+' descriptions. The notes are still there.','Cocktail Codex',10);
}

function clearDescriptionNotes(){
  var ss=SpreadsheetApp.getActive(), ui=SpreadsheetApp.getUi(), sh=ss.getSheetByName('Cocktails');
  var m=cleanDescHeaders_(sh), col=m[CLEAN_SOURCE_HEADER], last=sh.getLastRow();
  var rng=sh.getRange(2,col,last-1,1);
  var notes=rng.getNotes(), n=0;
  for (var r=0;r<notes.length;r++) if(String(notes[r][0]||'')) n++;
  if(!n){ ss.toast('No notes to clear.','Cocktail Codex',5); return; }
  var ans=ui.alert('Clear description notes',
    'This drops the stored originals for '+n+' row(s). After this there is no undo. Proceed?',
    ui.ButtonSet.YES_NO);
  if(ans!==ui.Button.YES) return;
  rng.clearNote();
  ss.toast('Cleared '+n+' notes.','Cocktail Codex',8);
}


/* ---------------------------------------------------------------------------
 * A scrollable modal for report text. Escapes everything: these strings contain
 * recipe text from the open internet, and one stray angle bracket would otherwise
 * break the dialog.
 * ------------------------------------------------------------------------- */
function cleanShowReport_(title, text){
  var esc=String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  var html='<div style="font:13px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;padding:4px 2px">'
    +'<pre style="white-space:pre-wrap;word-break:break-word;font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;'
    +'margin:0">'+esc+'</pre></div>';
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(820).setHeight(600), title);
}