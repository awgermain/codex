/**
 * Cocktail Codex — Merge RC-Index into the master amounts table  (v2, fast)
 * ------------------------------------------------------------------------
 * Run once from the editor: pick mergeIndexToAmounts and click Run.
 *
 * For each RC-Index recipe that exists in the Cocktails list, its rows in the
 * master table (RC_TAB) are REPLACED with the hand-verified RC-Index rows,
 * marked Source="manual". Standalone preps (Orgeat, Falernum) go to a Preps tab.
 *
 * v2: does the deletion as a single in-memory rewrite instead of row-by-row,
 * so it finishes in seconds. Safe to re-run — it always rebuilds those recipes
 * from RC-Index, so a previously interrupted run is cleaned up automatically.
 *
 * Tip: run this BEFORE adding the live missing-list formula to the master tab
 * (or remove that formula while running), so it isn't recalculating during the
 * rewrite.
 */
function mergeIndexToAmounts(){
  var ss=SpreadsheetApp.getActive();
  var idx=ss.getSheetByName('RC - Index');
  var cocktails=ss.getSheetByName('Cocktails');
  var as=ss.getSheetByName(RC_TAB);
  if(!idx||!as||!cocktails){ SpreadsheetApp.getUi().alert('Missing a required tab (RC - Index, Cocktails, or '+RC_TAB+').'); return; }

  // cocktail-name set
  var cl=cocktails.getLastRow();
  var nv=cocktails.getRange(2,7,cl-1,1).getValues();
  var isCocktail={};
  for(var i=0;i<nv.length;i++){ if(nv[i][0]) isCocktail[String(nv[i][0]).trim().toLowerCase()]=true; }

  // read RC-Index: Recipe, Order, Ingredient, Amount, Unit, Ratio, Category
  var il=idx.getLastRow(); if(il<2){ ss.toast('RC - Index is empty.','Cocktail Codex',5); return; }
  var irows=idx.getRange(2,1,il-1,7).getValues();

  var toMerge={}, mergeOrder=[], preps=[], mergeSet={};
  for(var q=0;q<irows.length;q++){
    var rec=String(irows[q][0]||'').trim(); if(!rec) continue;
    var ing=String(irows[q][2]||'').trim(); if(!ing) continue;
    var amt=irows[q][3];
    var unit=String(irows[q][4]||'').trim()||'fl oz';
    var cat=String(irows[q][6]||'').trim();
    if(isCocktail[rec.toLowerCase()]){
      if(!toMerge[rec]){ toMerge[rec]=[]; mergeOrder.push(rec); mergeSet[rec.toLowerCase()]=true; }
      toMerge[rec].push({ing:ing, amt:amt, unit:unit, cat:cat});
    } else {
      preps.push([rec, irows[q][1], ing, amt, unit, cat]);
    }
  }

  // read the whole master table (A:I), keep every row whose recipe is NOT being merged
  var al=as.getLastRow();
  var kept=[];
  if(al>=2){
    var cur=as.getRange(2,1,al-1,9).getValues();
    for(var r=0;r<cur.length;r++){
      var rn=String(cur[r][1]||'').trim();            // col B = Recipe
      if(rn==='') continue;                            // drop stray blank rows
      if(!mergeSet[rn.toLowerCase()]) kept.push(cur[r]);
    }
  }

  // build the replacement rows from RC-Index (proper keys + occurrence, manual)
  var fresh=[];
  for(var m=0;m<mergeOrder.length;m++){
    var rec2=mergeOrder[m]; var list=toMerge[rec2]; var seen={};
    for(var j=0;j<list.length;j++){
      var it=list[j]; var occ=(seen[it.ing]||0)+1; seen[it.ing]=occ;
      var key= occ===1 ? rec2+'|'+it.ing : rec2+'|'+it.ing+'|'+occ;
      fresh.push([key, rec2, it.ing, occ, it.amt, it.unit, it.cat, 'manual', '']);
    }
  }

  // combine, sort by recipe, and rewrite A:I in one shot
  var out=kept.concat(fresh);
  out.sort(function(a,b){ var x=String(a[1]).toLowerCase(), y=String(b[1]).toLowerCase(); return x<y?-1:(x>y?1:0); });
  as.getRange(2,1,as.getMaxRows()-1,9).clearContent();
  if(out.length) as.getRange(2,1,out.length,9).setValues(out);

  // preps -> Preps tab (append unique)
  if(preps.length){
    var pt=ss.getSheetByName('Preps')||ss.insertSheet('Preps');
    if(pt.getLastRow()<1){ pt.getRange(1,1,1,6).setValues([['Recipe','Order','Ingredient','Amount','Unit','Category']]).setFontWeight('bold'); pt.setFrozenRows(1); }
    var pl=pt.getLastRow(); var pex={};
    if(pl>=2){ var pv=pt.getRange(2,1,pl-1,3).getValues(); for(var p=0;p<pv.length;p++){ pex[pv[p][0]+'|'+pv[p][2]]=true; } }
    var padd=preps.filter(function(x){ return !pex[x[0]+'|'+x[2]]; });
    if(padd.length) pt.getRange(pt.getLastRow()+1,1,padd.length,6).setValues(padd);
  }

  ss.toast('Merged '+mergeOrder.length+' recipe(s) from RC-Index ('+fresh.length+' manual rows). Preps moved: '+preps.length+'. Total rows now: '+out.length+'.','Cocktail Codex',10);
}