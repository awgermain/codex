/**
 * Cocktail Codex — Build RC-Amounts from descriptions  (v13, recipe-block aware)
 *
 * v13: ingredient matching comes from IngredientLibrary.gs -- brands, styles, short
 *   forms and misspellings (Averna -> Amaro, Fortaleza -> Tequila, "3/4 oz lime" ->
 *   Lime Juice, Ramazotti -> Amaro Ramazzotti) -- and each amount now goes to ONE
 *   ingredient instead of every ingredient that matched it. "bsp" reads as barspoon.
 *
 * v12.4: lines with a link are no longer dropped -- only the link is removed
 *   (stripLinks_ in Config.gs). This was silently losing linked ingredients,
 *   most often grenadine and St. Germain.
 * ------------------------------------------------------------------------
 * Parses the fetched-description column into the RC - Amounts table.
 *
 * WHAT'S NEW IN v3:
 *  - SEGMENT-BASED parsing. Instead of matching a whole line and grabbing its
 *    first amount, each amount is paired with the ingredient text that FOLLOWS
 *    it. Fixes run-on descriptions ("¾ oz Lemon Lavender 2 oz gin ½ oz dry
 *    vermouth") that used to assign the first amount to everything.
 *  - PREFER OZ. When a source lists both oz and ml ("1 1/2oz (45ml) Tequila"
 *    or "2 oz or 60 ml Lime"), the metric alternative is stripped so oz wins.
 *  - ML -> FL OZ NORMALIZATION. Amounts parsed in ml/cl convert to fl oz
 *    (2 decimals). Legit oz values (incl. odd ones like 2/3 oz) are untouched.
 *  - St. Germain / elderflower and lemon-lavender synonyms added.
 *
 * v4 (updates):
 *  - Unit conversion set: ml, cl, tbsp, parts -> fl oz (1 part = 1 oz).
 *    tsp / barspoon / dashes / drops stay in their own units (converting the
 *    small spoon units to oz produced ugly values like 0.083, and reads worse).
 *  - Snapping now targets clean EIGHTHS *and THIRDS* within 0.06, so metric
 *    artifacts land on real bar measures (0.676 -> 0.667, 0.8 -> 0.75) while
 *    genuine 1/3 & 2/3 recipes are preserved. Never snaps a value to 0.
 *
 * v5 (updates):
 *  - Dual-unit fallback: when the oz value is nonsense (e.g. a typo like
 *    "1/45oz (7.5ml)") the parenthetical ml is used instead -> 0.25.
 *  - Absurd-fraction guard: fractions with denominator > 16 are ignored.
 *  - Line-scoped paren cleanup: a parenthetical oz conversion is stripped
 *    only when that line already has a metric amount (handles "40mL X (1 oz)"
 *    without harming "1 1/2 jiggers (2 1/4 oz)" where the oz is the real value).
 *
 * v6 (updates):
 *  - Output is now SORTED alphabetically by recipe name so the RC - Amounts
 *    and RC - Missing Amount tables line up for side-by-side comparison.
 *  - Adds a Description column (I): the full YouTube/web description, shown
 *    once on the first row of each recipe block (keeps the sheet light).
 *
 * v7 (IMPORTANT fix):
 *  - buildSegments now actually applies resolveDual_ (the dual-unit typo
 *    fallback), the absurd-fraction guard, and unit conversion+snap.
 *
 * v8 (updates):
 *  - Master tab name now read from RC_TAB (Config.gs). Clears only columns A:I on
 *    rebuild, preserving side tables such as the missing-amounts list in column K+.
 *
 * v9: Description (col I) written on every row.
 * v10: Top / Mix ingredients parsed like every other category.
 * v11: Description (col I) became a single spilling XLOOKUP in I2. The data write is
 *      8 columns wide and leaves I alone — anything below I2 breaks the spill.
 *
 * v12 (IMPORTANT fix — wrong recipe's amounts):
 *  - THE BUG. A description with several recipes (most of Anders Erickson's, Make &
 *    Drink's two-drink videos, roundup posts) was parsed as one long recipe, and each
 *    ingredient took the FIRST matching amount anywhere in it. Grapefruit Ginger
 *    Margarita got the Frozen Strawberry Margarita's lime; Magician's Descent got Test
 *    Pilot's rum. Two things combined to cause it:
 *      1. sectionsFor only recognised a header that EXACTLY equals a drink name, so
 *         "THE ALABAZAM RECIPE 11:18" or "5. THE WARD EIGHT RECIPE" never counted,
 *         no sections were found, and the whole description was used.
 *      2. CleanDescriptions had since removed every header line from the cell
 *         anyway (a header has no measurement), so there was nothing left to find.
 *  - THE FIX. Parsing now starts from the ORIGINAL description — the cell note the
 *    cleaner saved, falling back to the cell value — and splits it into recipe blocks
 *    with RecipeBlocks.gs (the same splitter the Desc Review uses). Only the block that
 *    belongs to this drink is parsed.
 *  - IT REFUSES TO GUESS. When the right block can't be told apart (a close call, no
 *    block matches, or the best block is headed by a different codex drink), that
 *    drink gets NO auto amounts instead of someone else's. It lands in RC - Missing
 *    Amount, and the reason goes to the Build Log tab. A missing amount is visible; a
 *    wrong one wasn't.
 *  - previewBuildAmounts() runs the same parse and writes a Build Preview tab
 *    (current vs new for every auto row that would change) WITHOUT touching RC.
 *    Run it first.
 *  - Within a drink's own block, an ingredient matching more lines than it has rows
 *    (three rum lines, two Rum rows) still takes them in order, as before — but it's
 *    now noted in the Build Log so it can be checked.
 *
 * v12.3: no more tabs. Preview and the skipped-drinks list show in a pop-up instead,
 *        and any old Build Log / Build Preview tab is deleted on the next run.
 * v12.2: a description cell that already holds just this drink's recipe (cleaned, or
 *        fixed by hand) is parsed instead of the note; and a skipped drink leaves the
 *        Build Log once all its amounts are filled in by hand.
 * v12.1: within each recipe, rows are sorted in the app's category order (Spirit,
 *        Modifier, Acid, Sweetener, Seasoning, Top / Mix, Other) instead of arbitrary.
 *
 * Manual rows (Source = "manual") are always preserved. Auto rows regenerate
 * on every run. Menu: Cocktail Codex -> Build amounts.
 */

var B_COCKTAILS='Cocktails';
var B_LOG_TAB='Build Log';          // no longer written; removed if found (v12.3)
var B_PREVIEW_TAB='Build Preview';  // no longer written; removed if found (v12.3)

/** 1-based column index -> A1 letter, so the lookup formula follows the headers
 *  rather than hardcoding G and AU. */
function bColLetter_(col){
  var s=''; while(col>0){ var m=(col-1)%26; s=String.fromCharCode(65+m)+s; col=(col-m-1)/26; }
  return s;
}
var B_FIRST_ROW=2;
// resolved by header, see Config.gs
function B_NAME_COL_(){ return COL('Name'); }
function B_DESC_COL_(){ return COL('YT_Description'); }
function B_COLS_(){ return codexIngCols_(); }   // [{col,idx,header,cat}, ...]

var VOL={ml:0.033814, cl:0.33814, tbsp:0.5, parts:1.0, 'fl oz':1};  // tsp/barspoon stay native

/* v13: SYN and STOP moved to IngredientLibrary.gs (ING_LIBRARY, LIB_STOP), which
   BuildAmounts, RecipeBlocks and CleanDescriptions now all share. */

var UF={'\u00bd':' 1/2','\u00bc':' 1/4','\u00be':' 3/4','\u2153':' 1/3','\u2154':' 2/3','\u215b':' 1/8','\u215c':' 3/8','\u215d':' 5/8','\u215e':' 7/8'};
function normFrac(s){ s=String(s); for(var k in UF){ s=s.split(k).join(UF[k]); } return s; }
function stripAcc(s){ return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/whisky/gi,'whiskey'); }
function toNum(q){ q=q.trim(); var m;
  if(m=q.match(/^(\d+)\s+(\d+)\/(\d+)$/)) return parseInt(m[1],10)+parseInt(m[2],10)/parseInt(m[3],10);
  if(m=q.match(/^(\d+)\/(\d+)$/)) return parseInt(m[1],10)/parseInt(m[2],10);
  return parseFloat(q);
}
function normUnit(u){ u=u.toLowerCase().replace(/\./g,'').trim();
  if(u==='oz'||u==='ounce'||u==='ounces'||u==='floz'||u==='fl oz')return 'fl oz';
  if(u==='ml'||u==='cl')return u;
  if(u.indexOf('dash')===0)return 'dashes';
  if(u.indexOf('barspoon')>-1||u.indexOf('bar spoon')>-1||u==='bsp')return 'barspoon';
  if(u.indexOf('tsp')===0||u.indexOf('teaspoon')>-1)return 'tsp';
  if(u.indexOf('tbsp')===0||u.indexOf('tablespoon')>-1)return 'tbsp';
  if(u.indexOf('drop')===0)return 'drops';
  if(u.indexOf('part')===0)return 'parts';
  if(u.indexOf('pinch')===0)return 'pinch';
  return u;
}
function snapClean(v){
  if(typeof v!=='number'||v<=0) return v;
  var best=v, bd=1e9;
  for(var k=0;k<9;k++){
    var cand=[];
    for(var i=0;i<8;i++) cand.push(k+0.125*i);
    cand.push(k+1/3); cand.push(k+2/3);
    for(var j=0;j<cand.length;j++){ var t=cand[j]; if(t<=0) continue; var d=Math.abs(t-v); if(d<bd){bd=d;best=t;} }
  }
  return (bd<=0.06)?Math.round(best*1000)/1000:Math.round(v*1000)/1000;
}
function normOz(a,u){
  if(VOL[u]!=null) return [snapClean(a*VOL[u]),'fl oz'];
  return [a,u];
}

var UNITS_RE='(?:fl\\s*oz|oz\\.?|ounces?|ml|cl|dashes?|dash|barspoons?|bar\\s*spoons?|bsp|tsp|teaspoons?|tbsp|tablespoons?|drops?|parts?|pinch(?:es)?)';
var QTY_RE='(?<!\\d)(\\d\\s+\\d+/\\d+|\\d+/\\d+|\\d*\\.\\d+|\\d+)';

function tokens(t){ return stripAcc(String(t).toLowerCase()).split(/\W+/).filter(function(x){return x;}); }
function termsFor(ing){ return libTerms_(ing).terms.map(function(t){ return t.t; }); }   // kept for anything still calling it
function segMatches(segtext,ing){ return !!ingMatch_(segtext, ing); }

/* v12: replaces sectionsFor. Picks this drink's recipe out of a (cleaned) description.
   Returns {lines: [...]} to parse, or {lines: null, why: '...'} when it won't guess.
     - fewer than two recipe blocks: the whole text, as before (a normal one-recipe
       description), unless that one block is headed by a DIFFERENT drink
     - two or more: the best-scoring block, only if it clearly wins */
function recipeLinesFor_(text, name, ingNames, allNames){
  var blocks=dsaBlocks_(text);
  var recipes=blocks.filter(function(b){ return b.meas.length>=2; });
  var ings=ingNames.map(function(n){ return {n:n}; });
  if(recipes.length<2){
    if(recipes.length===1){
      var own=dsaOtherOwner_(recipes[0].title, name, allNames);
      if(own) return {lines:null, why:'the only recipe in the description is headed "'+recipes[0].title+'" ('+own+') — description clipped or wrong?'};
    }
    return {lines:String(text).split('\n')};
  }
  var scored=recipes.map(function(b){ return {b:b, s:dsaScore_(b, name, ings, allNames)}; })
                    .sort(function(a,b){ return b.s-a.s; });
  var best=scored[0], second=scored[1];
  var owner=dsaOtherOwner_(best.b.title, name, allNames);
  var t=function(b){ return '"'+(b.title||'(untitled)')+'"'; };
  if(owner) return {lines:null, why:recipes.length+' recipes; best match '+t(best.b)+' belongs to '+owner};
  if(best.s<1) return {lines:null, why:recipes.length+' recipes; none matches this drink (best '+t(best.b)+')'};
  if(best.s-second.s<0.75) return {lines:null, why:recipes.length+' recipes; close call between '+t(best.b)+' and '+t(second.b)};
  return {lines:best.b.lines, title:best.b.title};
}

function parseQtyStr_(q){ q=String(q).trim(); var m;
  if(m=q.match(/^(\d+)\s+(\d+)\/(\d+)$/)) return parseInt(m[1],10)+parseInt(m[2],10)/parseInt(m[3],10);
  if(m=q.match(/^(\d+)\/(\d+)$/)) return parseInt(m[1],10)/parseInt(m[2],10);
  var f=parseFloat(q); return isNaN(f)?null:f;
}
function absurdRaw_(q){ var m=String(q).trim().match(/^\d+\/(\d+)$/); return !!(m && parseInt(m[1],10)>16); }
function resolveDual_(text){
  return text.replace(/(\d*\.\d+|\d+\s+\d+\/\d+|\d+\/\d+|\d+)\s*(?:fl\s*)?oz\.?\s*\(\s*(\d[\d.]*)\s*(ml|cl)\s*\)/ig,
    function(_,prim,metric,munit){
      var pv=parseQtyStr_(prim); metric=parseFloat(metric);
      var bad=absurdRaw_(prim)||pv==null||pv<0.04||pv>40;
      if(bad){ var oz=metric*(munit.toLowerCase()==='ml'?0.033814:0.33814); return ' '+(Math.round(oz*10000)/10000)+' oz '; }
      return ' '+prim+' oz ';
    });
}
function cleanLines(desc){
  var lines=normFrac(desc).split('\n'), out=[];
  for(var i=0;i<lines.length;i++){
    var ln=lines[i], low=ln.toLowerCase();
    // v12.4: strip the link, keep the line. Dropping the whole line lost every linked
    // ingredient ("0.5 oz grenadine (Liber - https://...)"). A line that was ONLY a
    // link comes back empty and is still dropped, exactly as before.
    var sl=stripLinks_(ln); if(sl!==ln){ ln=sl; if(!ln) continue; }
    ln=ln.replace(/(^|[\s(]),(\d)/g,'$1.$2');   // ,75 -> .75
    if(/\d\s*(?:ml|cl)\b/i.test(ln)) ln=ln.replace(/\([^)]*\d[^)]*(?:oz|ounce|fl\s*oz)[^)]*\)/ig,' '); // drop redundant paren oz
    out.push(ln);
  }
  return out.join('\n');
}
function buildSegments(sectionLines){
  var text=resolveDual_(normFrac(sectionLines.join(' ')));
  text=text.replace(/\([^)]*\d\s*(?:ml|cl|l)\b[^)]*\)/ig,' ');   // strip (45ml)
  text=text.replace(/\bor\s+\d[\d.\/ ]*\s*(?:ml|cl|l)\b/ig,' ');  // strip "or 60 ml"
  var re=new RegExp(QTY_RE+'\\s*('+UNITS_RE+')','ig');
  var segs=[], m, hits=[];
  while((m=re.exec(text))!==null){ hits.push({q:m[1],u:m[2],s:m.index,e:re.lastIndex}); }
  for(var j=0;j<hits.length;j++){
    if(absurdRaw_(hits[j].q)) continue;
    var a=toNum(hits[j].q); if(isNaN(a)) continue;
    var conv=normOz(a,normUnit(hits[j].u));            // convert ml/cl/tbsp/parts -> oz, snap
    if(conv[1]==='fl oz' && (conv[0]<0.04 || conv[0]>40)) continue;
    var end=(j+1<hits.length)?hits[j+1].s:text.length;
    segs.push({amt:conv[0], unit:conv[1], text:text.substring(hits[j].e,end).substring(0,70)});
  }
  return segs;
}

/* The whole parse, shared by the build and the preview. Returns the rows to write
   (header first, sorted) and a log of drinks it declined to guess for. */
function computeAmountRows_(ss){
  var cs=ss.getSheetByName(B_COCKTAILS), as=ss.getSheetByName(RC_TAB);
  if(!cs||!as) throw new Error('Missing Cocktails or RC - Amounts sheet.');
  var lastC=cs.getLastRow();
  var B_NAME_COL=B_NAME_COL_(), B_DESC_COL=B_DESC_COL_(), B_COLS=B_COLS_();
  var bWide=B_COLS.reduce(function(m,g){return Math.max(m,g.col);}, Math.max(B_NAME_COL,B_DESC_COL));
  var vals=cs.getRange(1,1,lastC,bWide).getValues();
  // v12: the cleaner keeps each original in the description cell's NOTE. The note
  // still has the recipe headers; the cleaned value doesn't.
  var descNotes=cs.getRange(1,B_DESC_COL,lastC,1).getNotes();
  var allNames=[];
  for(var r=B_FIRST_ROW-1;r<lastC;r++){ var nm=vals[r][B_NAME_COL-1]; if(nm) allNames.push(String(nm).trim()); }

  var out=[['Key','Recipe','Ingredient','Occ','Amount','Unit','Category','Source']];
  var log=[];
  var lastA=as.getLastRow();
  if(lastA>=2){
    var old=as.getRange(2,1,lastA-1,8).getValues();
    for(var i=0;i<old.length;i++){ if(String(old[i][7]).toLowerCase()==='manual' && old[i][0]) out.push(old[i]); }
  }
  var manualKeys={}; for(var q=1;q<out.length;q++) manualKeys[out[q][0]]=true;

  for(var r2=B_FIRST_ROW-1;r2<lastC;r2++){
    var name=vals[r2][B_NAME_COL-1]; if(!name) continue; name=String(name);
    var dVal=String(vals[r2][B_DESC_COL-1]||''), dNote=String(descNotes[r2][0]||'').trim();
    var desc=dNote||dVal;

    // this drink's ingredient names, for scoring which recipe block is its own
    var ingNames=[];
    for(var c0=0;c0<B_COLS.length;c0++){ var v0=vals[r2][B_COLS[c0].idx]; if(v0!==''&&v0!=null&&String(v0).trim()) ingNames.push(String(v0).trim()); }

    // v12.2: the CELL wins when it already holds just this drink's recipe -- what the
    // cleaner now produces, or what you typed in by hand to fix a description. The note
    // is used only when the cell still holds several recipes or a v1-style smash (more
    // amount lines than the drink has ingredients). Before, the note always won, so a
    // description you corrected by hand was ignored and the drink stayed skipped.
    if(dNote && dVal){
      var vr=dsaBlocks_(cleanLines(dVal)).filter(function(b){ return b.meas.length>=2; });
      if(vr.length===1 && vr[0].meas.length<=ingNames.length+2) desc=dVal;
    }
    var segs=[], skipWhy='';
    if(desc && String(desc).length>10){
      var pick0=recipeLinesFor_(cleanLines(String(desc)), name.trim(), ingNames, allNames);
      if(pick0.lines) segs=buildSegments(pick0.lines.filter(function(l){return String(l).trim();}));
      else skipWhy=pick0.why;
    }
    // v13: each amount goes to ONE of this drink's ingredients (ingWinners_), so
    // "Hamilton Pimento Dram" fills Allspice Liqueur, not Rum as well.
    var distinctIngs=ingNames.filter(function(n,i){ return ingNames.indexOf(n)===i; });
    segs.forEach(function(sg){ sg.win=ingWinners_(sg.text, distinctIngs); });
    var seen={}, total={};
    ingNames.forEach(function(n){ total[n]=(total[n]||0)+1; });
    for(var c=0;c<B_COLS.length;c++){
      var col=B_COLS[c].col, cat=B_COLS[c].cat;
      var ing=vals[r2][B_COLS[c].idx]; if(ing===''||ing==null||String(ing).trim()==='') continue;
      ing=String(ing).trim();
      // Top / Mix flows through like any other category: it only gets a row if the
      // description states an amount (e.g. "800 ml coconut water"). True "to top"
      // pours have no amount in the text, so the "no candidate -> continue" logic
      // below skips them naturally — measured mixers captured, tops stay optional.
      var occ=(seen[ing]||0); seen[ing]=occ+1;
      var key=occ===0 ? name+'|'+ing : name+'|'+ing+'|'+(occ+1);
      if(manualKeys[key]) continue;
      if(!segs.length) continue;
      var cands=[]; for(var s=0;s<segs.length;s++){ if(segs[s].win.indexOf(ing)>-1) cands.push(segs[s]); }
      if(!cands.length) continue;
      var pick=(occ<cands.length)?cands[occ]:cands[0];
      // More matching lines than rows, with different amounts: taken in order as
      // before, but noted -- this is where a leftover line could still sneak in.
      if(occ===0 && cands.length>total[ing]){
        var dist={}; cands.forEach(function(x){ dist[x.amt+' '+x.unit]=1; });
        if(Object.keys(dist).length>1) log.push([name,'check — '+ing,cands.length+' lines match, '+total[ing]+' row(s); took '+cands.slice(0,total[ing]).map(function(x){return x.amt+' '+x.unit;}).join(', ')+' of '+Object.keys(dist).join(', ')]);
      }
      out.push([key,name,ing,occ+1,pick.amt,pick.unit,cat,'auto']);
    }
    // Log a skipped drink only while it still has rows nobody has filled. Once you've
    // entered its amounts by hand (manual rows), the skip no longer matters and it
    // drops off the Build Log.
    if(skipWhy){
      var seen2={}, open=false;
      ingNames.forEach(function(n){ var o=(seen2[n]||0); seen2[n]=o+1; var k=o===0?name+'|'+n:name+'|'+n+'|'+(o+1); if(!manualKeys[k]) open=true; });
      if(open) log.push([name,'skipped — no auto amounts',skipWhy]);
    }
  }
  // ----- sort: Recipe A-Z (matches RC - Missing Amount), then the APP's category order -----
  // v12.1: within a recipe, rows follow the order the app lists ingredients in --
  // Spirit, Modifier, Acid, Sweetener, Seasoning, Top / Mix, then the rest -- instead of
  // whatever order they came out in. Keep CAT_RANK in step with CAT_ORDER in index.html.
  var CAT_RANK={'Spirit':1,'Modifier':2,'Acid':3,'Sweetener':4,'Seasoning':5,'Top / Mix':6,'Muddled':7,'Other':8};
  var header=out.shift();
  out.sort(function(a,b){
    var x=String(a[1]).toLowerCase(), y=String(b[1]).toLowerCase();
    if(x!==y) return x<y?-1:1;                                     // recipe A-Z, as before
    var r=(CAT_RANK[a[6]]||9)-(CAT_RANK[b[6]]||9);                 // then category order
    return r || (Number(a[3])||0)-(Number(b[3])||0);               // repeats (Rum, Rum|2) stay in Occ order
  });
  out.unshift(header);
  return {out:out, log:log, as:as};
}

function buildAmountsFromDescriptions(){
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var res=computeAmountRows_(ss), out=res.out, as=res.as;

  /* ----- Description (col I) is a LOOKUP, not a copy -----
     One spilling formula in I2 reads Cocktails live. A2:I must be CLEAR below I2 or
     the spill fails with #REF!, which is why the data write below is 8 columns wide
     and never touches I. */
  as.getRange(1,1,as.getMaxRows(),9).clearContent();   // A:I; side tables in K+ survive
  as.getRange(1,1,out.length,8).setValues(out);        // 8 wide: column I is left for the formula

  var nameA1=bColLetter_(B_NAME_COL_()), descA1=bColLetter_(B_DESC_COL_());
  as.getRange(1,9).setValue('Description');
  as.getRange(2,9).setFormula(
    '=ARRAYFORMULA(IF(B2:B="","",IFERROR(XLOOKUP(B2:B,'+B_COCKTAILS+'!'+nameA1+':'+nameA1+','
    +B_COCKTAILS+'!'+descA1+':'+descA1+',""),"")))');

  bRemoveOldTabs_(ss);
  var skipped=res.log.filter(function(r){ return r[1].indexOf('skipped')===0; });
  ss.toast('Build amounts: wrote '+(out.length-1)+' rows (manual preserved).'
    +(skipped.length?' '+skipped.length+' drink(s) skipped rather than guessed.':''),'Cocktail Codex',10);
  // No tab: the skipped drinks (if any) appear in a pop-up you close when done.
  if(skipped.length) bShowReport_('Build Amounts — drinks skipped rather than guessed',
    skipped.length+' drink(s) got no auto amounts because their recipe could not be told apart in the description. '
    +'Fill them in by hand (they also appear in RC - Missing Amount); each one leaves this list once all its amounts are filled.',
    ['Recipe','Why'], skipped.map(function(r){ return [r[0], r[2]]; }));
}

/* Same parse, nothing written anywhere. Shows every auto row whose amount would change,
   appear or disappear, plus the drinks it would skip, in a pop-up -- no tab. */
function previewBuildAmounts(){
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var res=computeAmountRows_(ss), as=res.as;
  var cur={}, nxt={};
  var lastA=as.getLastRow();
  if(lastA>=2) as.getRange(2,1,lastA-1,8).getValues().forEach(function(r){
    if(r[0] && String(r[7]).toLowerCase()!=='manual') cur[r[0]]=r;
  });
  res.out.slice(1).forEach(function(r){ if(String(r[7]).toLowerCase()!=='manual') nxt[r[0]]=r; });
  var rows=[];
  Object.keys(cur).forEach(function(k){
    var a=cur[k], b=nxt[k];
    if(!b) rows.push(['removed',a[1],a[2],a[4]+' '+a[5],'']);
    else if(String(a[4])!==String(b[4])||String(a[5])!==String(b[5])) rows.push(['changed',a[1],a[2],a[4]+' '+a[5],b[4]+' '+b[5]]);
  });
  Object.keys(nxt).forEach(function(k){ if(!cur[k]){ var b=nxt[k]; rows.push(['added',b[1],b[2],'',b[4]+' '+b[5]]); } });
  var ord={changed:0,removed:1,added:2};
  rows.sort(function(a,b){ return ord[a[0]]-ord[b[0]] || String(a[1]).localeCompare(String(b[1])); });

  bRemoveOldTabs_(ss);
  var n={changed:0,removed:0,added:0}; rows.forEach(function(r){ n[r[0]]++; });
  var notes=res.log.map(function(r){ return [r[1].indexOf('skipped')===0?'skipped':'check', r[0], r[1].replace(/^(skipped — no auto amounts|check — )/,''), r[2], '']; });
  ss.toast('Preview: '+n.changed+' changed, '+n.removed+' removed, '+n.added+' added. Nothing was written.','Cocktail Codex',10);
  bShowReport_('Preview Build Amounts — nothing has been written',
    n.changed+' changed, '+n.removed+' removed, '+n.added+' added'
    +(notes.length?'; '+notes.length+' note(s) at the bottom (skipped drinks, and ingredients with more matching lines than rows)':'')
    +'. If it looks right, run Build Amounts.',
    ['Change','Recipe','Ingredient','Now','After rebuild'], rows.concat(notes));
}

/* The old Build Log / Build Preview tabs are no longer used; tidy them away. */
function bRemoveOldTabs_(ss){
  [B_LOG_TAB, B_PREVIEW_TAB].forEach(function(t){ var sh=ss.getSheetByName(t); if(sh) try{ ss.deleteSheet(sh); }catch(e){} });
}

/* A scrollable pop-up table. From the script editor there is no screen for a pop-up,
   so it falls back to the execution log. */
function bShowReport_(title, intro, header, rows){
  var esc=function(v){ return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;'); };
  var html='<div style="font:13px Arial,sans-serif"><p>'+esc(intro)+'</p>'
    +'<table style="border-collapse:collapse;width:100%"><tr>'+header.map(function(h){ return '<th style="text-align:left;border-bottom:2px solid #999;padding:4px 6px;position:sticky;top:0;background:#fff">'+esc(h)+'</th>'; }).join('')+'</tr>'
    +rows.map(function(r){ return '<tr>'+r.slice(0,header.length).map(function(c){ return '<td style="border-bottom:1px solid #ddd;padding:4px 6px;vertical-align:top">'+esc(c)+'</td>'; }).join('')+'</tr>'; }).join('')
    +'</table>'+(rows.length?'':'<p><i>Nothing to show.</i></p>')+'</div>';
  try{
    SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(900).setHeight(560), title);
  }catch(e){
    Logger.log(title+'\n'+intro+'\n'+rows.map(function(r){ return r.join(' | '); }).join('\n'));
  }
}