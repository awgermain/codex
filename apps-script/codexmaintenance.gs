/**
 * Cocktail Codex — Maintenance helpers  (v4)
 * ------------------------------------------
 * Run from the ribbon: Cocktail Codex -> Maintenance.
 *
 *  normalizeAmounts() — cleans the RC-Amounts "Amount" column in place:
 *       • converts ml, cl, tbsp, and parts to fl oz (1 part = 1 oz)
 *       • snaps fl oz values to clean EIGHTHS and THIRDS within 0.06
 *         (0.676 -> 0.667, 0.8 -> 0.75), preserving genuine 1/3 & 2/3
 *       • leaves tsp / barspoon / dashes / drops in their own units
 *       • never snaps a value to 0, and leaves odd values it can't clean
 *
 * v2: normalizeAmounts now also does unit conversion and thirds-aware snapping.
 * v3: autoTagBlanks detected Smoky and kept it past the 3-mood cap.
 * v4: autoTagBlanks() retired and split by column.
 * v5: this file is now AMOUNTS ONLY. Every tag column has its own script:
 *       Mood (AU)    -> tagMoods()       TagMoods.gs
 *       Season (AV)  -> tagSeason()      TagSeason.gs
 *       Holiday (AW) -> tagHolidays()    TagHolidays.gs
 *       Family (AX)  -> tagFamilies()    TagFamilies.gs
 *       Era (AY)     -> seedEraFromIBA() SeedEra.gs
 *     deriveMood_, deriveSeason_ and deriveHoliday_ are all gone from here.
 *     Do NOT re-add them — two scripts writing one column means the last one run
 *     wins, silently.
 */

var VOL_TO_OZ={ml:0.033814, cl:0.33814, tbsp:0.5, parts:1.0};

function snapClean_(v){
  if(typeof v!=='number'||v<=0) return v;
  var best=v, bd=1e9;
  for(var k=0;k<9;k++){
    var cand=[]; for(var i=0;i<8;i++) cand.push(k+0.125*i); cand.push(k+1/3); cand.push(k+2/3);
    for(var j=0;j<cand.length;j++){ var t=cand[j]; if(t<=0) continue; var d=Math.abs(t-v); if(d<bd){bd=d;best=t;} }
  }
  return (bd<=0.06)?Math.round(best*1000)/1000:Math.round(v*1000)/1000;
}

function normalizeAmounts(){
  var sh=SpreadsheetApp.getActive().getSheetByName(RC_TAB);
  var last=sh.getLastRow(); if(last<2) return;
  var rng=sh.getRange(2,5,last-1,2);   // E=Amount, F=Unit
  var vals=rng.getValues(); var conv=0, snapped=0;
  for(var i=0;i<vals.length;i++){
    var a=vals[i][0], u=String(vals[i][1]||'').toLowerCase().trim();
    if(typeof a!=='number') continue;
    if(VOL_TO_OZ[u]!=null){ a=snapClean_(a*VOL_TO_OZ[u]); vals[i][0]=a; vals[i][1]='fl oz'; conv++; }
    else if(u==='fl oz'){ var s=snapClean_(a); if(s!==a){ vals[i][0]=s; snapped++; } }
  }
  rng.setValues(vals);
  SpreadsheetApp.getActive().toast('Normalized — converted '+conv+' to fl oz, snapped '+snapped+'.','Cocktail Codex',6);
}