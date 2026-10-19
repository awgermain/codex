/**
 * Cocktail Codex — Add Amount helper  (v15, bulk worklist)
 * -------------------------------------------------------
 * Loads the ENTIRE manual backlog at once: EVERY ingredient with no amount in
 * RC_TAB, across ALL recipes — mirrors the missing-list, including parser misses
 * in recipes that DO have a description. Type amounts, then File — filed rows
 * move to the master table as Source="manual" and drop off the sheet.
 *
 * Columns (Key first, Description last):
 *   A Key | B Recipe | C Ingredient | D Amount | E Unit | F Category | G Source | H Description
 * • Key shows a spaced " | " separator; filing converts it back to the real key.
 * • Source (G) is a clickable link to the recipe's video/page, when available.
 * • Description (H) is the full YT description (no truncation).
 *
 * v12: Source link replaces the Status column; full (untruncated) descriptions;
 *      bad amounts are flagged with a cell note on the Amount instead of a column.
 * v13: source-link reader handles all three link forms.
 * v14: Reset is now GENTLE — it clears the data but keeps your headers,
 *      formatting, and column widths (only a Table blocking it forces a rebuild).
 *      For normal use you rarely need Reset: just Load, then File.
 * v19: muddled units added to the dropdown -- leaf, slice, chunk, sprig, wedge. Store
 *     them SINGULAR: the app pluralises from the quantity, so one stored value gives
 *     "1 leaf" and "6 leaves". setAllowInvalid stays true, so the list is a
 *     convenience and you can still type anything.
 * v18: the recipe name is TRIMMED when staging. It was the only script keying on the
 *     raw cell, so any drink whose name carried a trailing space filed its amounts
 *     under a key nothing else could match -- they published as no amount, and fixing
 *     them by hand did not stick because the next Load recreated them.
 * v17: Top / Mix is no longer skipped, and the Recipe cell links to its Cocktails row.
 * v16: the staged Unit now comes from the ingredient's CATEGORY. 'Muddled' stages
 *      as '-' (a count) instead of 'fl oz'. Previously every row staged as 'fl oz'
 *      and the v15 count-unit fallback only fired on a BLANK unit, so it never
 *      actually ran — which is how "2 fl oz Mint" entered the data. fileAmounts
 *      now also treats category 'Muddled' as a count if the unit is cleared.
 * v15: count items (egg, egg white, whole, leaf, slice, pinch...) auto-file with
 *      a '-' unit when you leave the unit blank, instead of fl oz; '-' is never
 *      converted and shows as a bare number.
 * v11: Key-first with spaced display key.  v10: Description last.  v9: Reset
 *      recreates the sheet (typed-column fix).  v8: added Description.
 *
 * Menu (Cocktail Codex -> Add amounts):
 *   • Load all missing amounts  • File amounts  • Reset entry sheet
 */

var AE_TAB='Add Amount';
// Category per ingredient column, derived from CODEX_ING_GROUPS (Config.gs) so a new
// ingredient column is picked up automatically. Keyed by column number.
function aeCatMap_(){ var m={}, g=codexIngCols_();
  for(var i=0;i<g.length;i++) m[g[i].col]=g[i].cat;
  return m; }
// Categories NOT staged for amount entry (no measured pour).
/* Top / Mix used to be skipped here on the theory that a topper has no measured pour.
   The data disagrees 2 to 1 -- 69 of 105 already carry one, Club Soda at 2.5 fl oz,
   Beer at 3. The other 36 were unreachable: never staged, so never fillable, and
   absent from the backlog count, which is why a missing Club Soda looked like nothing
   was wrong. Nothing is skipped now; a genuine no-pour item like Ice is left blank. */
var AE_SKIP_CATS={};
var AE_VOL={ml:0.033814, cl:0.33814, tbsp:0.5, parts:1.0, 'fl oz':1};

function aeDispKey_(real){ return String(real).split('|').join(' | '); }
function aeRealKey_(disp){ return String(disp).split(' | ').join('|');  }

function aeSrcUrl_(rtv, val, formula){
  // 1) rich-text link (whole-cell or per-run)
  if(rtv){
    try{ var u=rtv.getLinkUrl(); if(u) return u; }catch(e){}
    try{ var runs=rtv.getRuns(); for(var i=0;i<runs.length;i++){ var ru=runs[i].getLinkUrl(); if(ru) return ru; } }catch(e){}
  }
  // 2) =HYPERLINK("url", ...) formula
  if(formula){ var m=String(formula).match(/HYPERLINK\(\s*"([^"]+)"/i); if(m) return m[1]; }
  // 3) plain URL sitting in the cell
  if(val && /^https?:\/\//i.test(String(val).trim())) return String(val).trim();
  return '';
}

function aeSnap_(v){
  if(typeof v!=='number'||v<=0) return v;
  var best=v, bd=1e9;
  for(var k=0;k<9;k++){
    var cand=[]; for(var i=0;i<8;i++) cand.push(k+0.125*i); cand.push(k+1/3); cand.push(k+2/3);
    for(var j=0;j<cand.length;j++){ var t=cand[j]; if(t<=0) continue; var d=Math.abs(t-v); if(d<bd){bd=d;best=t;} }
  }
  return (bd<=0.06)?Math.round(best*1000)/1000:Math.round(v*1000)/1000;
}
function aeNormUnit_(u){
  u=String(u||'').toLowerCase().trim();
  if(u==='oz'||u==='oz.'||u==='ounce'||u==='ounces'||u==='floz'||u==='fl oz'||u==='') return 'fl oz';
  if(u==='tablespoon'||u==='tablespoons') return 'tbsp';
  if(u==='teaspoon'||u==='teaspoons') return 'tsp';
  if(u==='dash') return 'dashes';
  if(u==='drop') return 'drops';
  if(u==='bar spoon'||u==='barspoons') return 'barspoon';
  if(u==='part') return 'parts';
  return u;
}
function aeConv_(a,u){ if(AE_VOL[u]!=null) return [aeSnap_(a*AE_VOL[u]),'fl oz']; return [a,u]; }
function aeLastDataRow_(sh){
  var col=sh.getRange(1,1,sh.getMaxRows(),1).getValues();
  for(var r=col.length; r>=2; r--){ if(String(col[r-1][0]).trim()!=='') return r; }
  return 1;
}
function aeAmountedKeys_(ss){
  var as=ss.getSheetByName(RC_TAB); var al=as.getLastRow(); var m={};
  if(al>=2){ var v=as.getRange(2,1,al-1,8).getValues(); for(var i=0;i<v.length;i++){ if(v[i][0]&&v[i][4]!==''&&v[i][4]!=null) m[String(v[i][0])]=true; } }
  return m;
}
function aeEnsureLayout_(ss){
  var sh=ss.getSheetByName(AE_TAB) || ss.insertSheet(AE_TAB);
  var h=sh.getRange(1,1,1,8).getValues()[0];
  if(h[0]!=='Key'||h[1]!=='Recipe'||h[6]!=='Source'||h[7]!=='Description'){
    sh.getRange(1,1,1,8).setValues([['Key','Recipe','Ingredient','Amount','Unit','Category','Source','Description']]).setFontWeight('bold');
    sh.setFrozenRows(1);
    try {
      sh.getRange(2,5,3000,1).setDataValidation(SpreadsheetApp.newDataValidation()
        .requireValueInList(['fl oz','-','whole','tsp','tbsp','barspoon','dashes','drops','parts','pinch','ml','cl',
                             'leaf','slice','chunk','sprig','wedge'],true).setAllowInvalid(true).build());
      sh.setColumnWidth(1,240); sh.setColumnWidth(2,180); sh.setColumnWidth(3,170);
      sh.setColumnWidth(4,80);  sh.setColumnWidth(5,90);  sh.setColumnWidth(6,110);
      sh.setColumnWidth(7,90);  sh.setColumnWidth(8,560);
      sh.getRange(2,8,3000,1).setWrap(true).setVerticalAlignment('top').setFontSize(9);  // Description (last col)
    } catch(e) {
      SpreadsheetApp.getActive().toast('Add Amount is a Table, so formatting was skipped. Run "Reset entry sheet" for the clean layout.','Cocktail Codex',8);
    }
  }
  return sh;
}

function setupAmountEntry(){
  var ss=SpreadsheetApp.getActive();
  var sh=ss.getSheetByName(AE_TAB);
  if(!sh){ ss.insertSheet(AE_TAB); aeEnsureLayout_(ss); ss.toast('Add Amount created. Run "Load all missing amounts".','Cocktail Codex',6); return; }
  try{
    var mr=sh.getMaxRows();
    if(mr>1){ sh.getRange(2,1,mr-1,8).clearContent(); sh.getRange(2,4,mr-1,1).clearNote(); }  // clear data A:H + amount notes; KEEP headers, formatting, column widths
    aeEnsureLayout_(ss);                                   // no-op when headers already match, so your formatting stays
    ss.toast('Add Amount cleared — your formatting is kept. Run "Load all missing amounts".','Cocktail Codex',6);
  }catch(e){
    // a Table / typed columns blocked the soft clear -> full rebuild (only case that loses formatting)
    ss.deleteSheet(sh); ss.insertSheet(AE_TAB); aeEnsureLayout_(ss);
    ss.toast('Add Amount rebuilt fresh (a Table blocked the soft reset). Tip: keep this tab as a normal range, not a Table, to preserve formatting.','Cocktail Codex',9);
  }
}

function loadAllMissingAmounts(){
  var ss=SpreadsheetApp.getActive();
  var sh=aeEnsureLayout_(ss);
  var cocktails=ss.getSheetByName('Cocktails'); var cl=cocktails.getLastRow();
  // all by header, see Config.gs
  var AE_NAME=COL('Name'), AE_DESC=COL('YT_Description'), AE_SRC=COL('Source');
  var AE_ING=codexIngCols_(), AE_CATMAP=aeCatMap_();
  var aeWide=AE_ING.reduce(function(m,g){return Math.max(m,g.col);}, Math.max(AE_NAME,AE_DESC,AE_SRC));
  var cv=cocktails.getRange(2,1,cl-1,aeWide).getValues();
  var srcRich=cocktails.getRange(2,AE_SRC,cl-1,1).getRichTextValues();
  var srcVal =cocktails.getRange(2,AE_SRC,cl-1,1).getValues();
  var srcForm=cocktails.getRange(2,AE_SRC,cl-1,1).getFormulas();
  var amounted=aeAmountedKeys_(ss);
  var AE_SS_URL=ss.getUrl(), AE_CK_GID=cocktails.getSheetId();

  var last=aeLastDataRow_(sh); var staged={};
  if(last>=2){ var f=sh.getRange(2,1,last-1,1).getValues(); for(var i=0;i<f.length;i++){ if(f[i][0]) staged[aeRealKey_(f[i][0])]=true; } }

  var recs=[];
  /* TRIM. Every other script keys on the trimmed name -- PublishCodex, BuildAmounts,
     the audit -- and this one did not, so a Cocktails cell with a trailing space
     produced "Applejack Rabbit |Apple Brandy" here and "Applejack Rabbit|Apple Brandy"
     everywhere else. The rows filed fine and then published as no amount, and repairing
     them did nothing because the next Load minted the same broken key again. */
  for(var r=0;r<cv.length;r++){ var nm=cv[r][AE_NAME-1]; if(nm) recs.push([String(nm).trim(),r]); }
  recs.sort(function(a,b){return a[0]<b[0]?-1:(a[0]>b[0]?1:0);});

  var add=[];
  for(var q=0;q<recs.length;q++){
    var name=recs[q][0], ri=recs[q][1], row=cv[ri];
    var desc=String(row[AE_DESC-1]||'').trim();                       // full description, no cap
    var url=aeSrcUrl_(srcRich[ri][0], srcVal[ri][0], srcForm[ri][0]);
    var srcCell=url ? '=HYPERLINK("'+url+'","\u2197 source")' : '';
    var seen={};
    for(var gi=0;gi<AE_ING.length;gi++){
      var c=AE_ING[gi].col;
      if(AE_SKIP_CATS[AE_ING[gi].cat]) continue;               // skip Top / Mix by CATEGORY
      var ing=row[AE_ING[gi].idx]; if(ing===''||ing==null||String(ing).trim()==='') continue;
      ing=String(ing).trim();   // ingredient was already trimmed; the recipe name was not
      var occ=(seen[ing]||0)+1; seen[ing]=occ;
      var key = occ===1 ? name+'|'+ing : name+'|'+ing+'|'+occ;
      if(amounted[key]||staged[key]) continue;
      // Stage the unit that CATEGORY implies, not a blanket 'fl oz'. Muddled holds
      // leaves, fruit and slices — things you count, not pour. Staging 'fl oz' here
      // is how "2 fl oz Mint" got into the data in the first place: the count-unit
      // fallback in fileAmounts only fires when Unit is BLANK, and a pre-filled
      // 'fl oz' is not blank, so it never got a chance to correct anything.
      var cat = AE_CATMAP[c] || '';
      var stageUnit = (cat === 'Muddled') ? '-' : 'fl oz';
      // Recipe links back to its row on Cocktails so you can open the drink without
      // hunting for it. ri is the 0-based data index, so its sheet row is ri+2.
      var recCell = AE_SS_URL ? '=HYPERLINK("'+AE_SS_URL+'#gid='+AE_CK_GID+'&range=A'+(ri+2)+'","'+String(name).replace(/"/g,'""')+'")' : name;
      add.push([aeDispKey_(key), recCell, ing, '', stageUnit, cat, srcCell, desc]);
    }
  }
  if(!add.length){ ss.toast('Nothing to load — the manual backlog is empty (or already staged).','Cocktail Codex',6); return; }
  sh.getRange(aeLastDataRow_(sh)+1,1,add.length,8).setValues(add);
  ss.toast('Loaded '+add.length+' missing ingredient(s). Type amounts, then File.','Cocktail Codex',8);
}

function fileAmounts(){
  var ss=SpreadsheetApp.getActive();
  var sh=ss.getSheetByName(AE_TAB); if(!sh){ ss.toast('Run "Load all missing amounts" first.','Cocktail Codex',4); return; }
  var last=aeLastDataRow_(sh); if(last<2){ ss.toast('No rows to file.','Cocktail Codex',4); return; }
  var rows=sh.getRange(2,1,last-1,6).getValues();   // Key,Recipe,Ingredient,Amount,Unit,Category

  var as=ss.getSheetByName(RC_TAB); var al=as.getLastRow();
  var akeys=al>=2 ? as.getRange(2,1,al-1,1).getValues() : [];
  var keyRow={}; for(var r=0;r<akeys.length;r++){ if(akeys[r][0]) keyRow[String(akeys[r][0])]=r+2; }

  var appended=[], pending={}, added=0, updated=0, doneRows=[], bad=0;
  for(var q=0;q<rows.length;q++){
    var key=aeRealKey_(String(rows[q][0]||'').trim());
    var rec=String(rows[q][1]||'').trim(), ing=String(rows[q][2]||'').trim();
    // Recipe is a HYPERLINK now. getValues() hands back the display text, but strip the
    // wrapper defensively so a formula can never be filed as a recipe name.
    var hm=rec.match(/^=HYPERLINK\([^,]*,\s*"(.*)"\)$/i); if(hm) rec=hm[1].replace(/""/g,'"');
    var amt=rows[q][3], unit=rows[q][4], cat=String(rows[q][5]||'').trim();
    if(!key){ if(rec&&ing) key = rec+'|'+ing; else continue; }
    if(amt===''||amt==null){ continue; }                    // not filled yet — leave it
    if(typeof amt!=='number'){ var pf=parseFloat(amt); if(isNaN(pf)){ sh.getRange(q+2,4).setNote('Not a number — fix and re-file'); bad++; continue; } amt=pf; }
    sh.getRange(q+2,4).clearNote();
    var occ=1; var mk=key.match(/\|(\d+)$/); if(mk) occ=parseInt(mk[1],10);
    var rawUnit=String(unit||'').trim();
    // Category first: 'Muddled' is always a count, whatever the ingredient is named.
    // The name regex cannot know that Mint, Cucumber and Strawberry are counted.
    if(!rawUnit) rawUnit = (cat === 'Muddled'
      || /(egg|whole|\bleaf\b|leaves|sprig|wedge|\bslice|pinch|zest|twist|peel)/i.test(ing)) ? '-' : 'fl oz';
    var conv=aeConv_(amt, aeNormUnit_(rawUnit));
    if(keyRow[key]){
      var rr=keyRow[key];
      as.getRange(rr,5).setValue(conv[0]); as.getRange(rr,6).setValue(conv[1]); as.getRange(rr,8).setValue('manual');
      if(cat) as.getRange(rr,7).setValue(cat);
      updated++; doneRows.push(q+2);
    } else if(pending[key]!=null){
      appended[pending[key]][4]=conv[0]; appended[pending[key]][5]=conv[1]; doneRows.push(q+2);
    } else {
      pending[key]=appended.length;
      appended.push([key,rec,ing,occ,conv[0],conv[1],cat,'manual','']);
      added++; doneRows.push(q+2);
    }
  }
  if(appended.length){ as.getRange(as.getLastRow()+1,1,appended.length,9).setValues(appended); }
  doneRows.sort(function(a,b){return b-a;});
  for(var d=0;d<doneRows.length;d++){ sh.deleteRow(doneRows[d]); }
  ss.toast('Filed — '+added+' added, '+updated+' updated (Source="manual"). '+doneRows.length+' cleared'+(bad?', '+bad+' flagged (see note on Amount)':'')+'.','Cocktail Codex',8);
}