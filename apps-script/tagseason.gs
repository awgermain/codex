/**
 * Cocktail Codex — Tag Season  (v2)
 * ---------------------------------
 * Owns the Season column. SAFE: fills only BLANK cells, never overwrites yours.
 * SEASON_OVERRIDE forces a value. SEASON_REBUILD_ALL = true recomputes everything.
 *
 * ── WHAT CHANGED IN v2, AND WHY ──────────────────────────────────────────
 * Spring had 19 drinks against Summer's 394. Three separate causes, not one:
 *
 * 1) TIES WENT TO SUMMER BY ACCIDENT. The winner was picked with a plain loop
 *    over the score object, so a 2-2 draw went to whichever key happened to be
 *    declared first -- Summer. The Casper and The Infante both scored Spring 2,
 *    Summer 2 and were filed as Summer on nothing but property order. Season is
 *    a MULTI-SELECT column, so a genuine tie should return both. It does now.
 *
 * 2) SPRING'S VOCABULARY WAS TINY. Twelve trigger words against Summer's
 *    twenty-odd, and only one of them (strawberry) was common. Added apricot,
 *    snap pea, matcha, jasmine, green tea, and gave mint, green Chartreuse,
 *    Lillet and celery a point each.
 *
 * 3) THE FLOOR OF 2 BLOCKED IT. Strawberry scored 1, so fourteen strawberry
 *    drinks with no second signal stayed blank forever. Strawberry is now 2.
 *
 * Cucumber and basil now score for Spring AND Summer rather than Summer alone,
 * which is what lets a cucumber drink come out as both instead of neither.
 *
 * Result on the current collection: Spring 19 -> 56, Summer 394 -> 346,
 * Autumn 80 -> 121, Winter unchanged at 79. 76 drinks get more than one season.
 *
 * 4) "APPLE" WAS MATCHING INSIDE "PINEAPPLE". seasonHas_ used indexOf, so every one
 *    of 172 pineapple drinks scored Autumn +2. Summer normally won outright so the
 *    damage stayed hidden; it only surfaced once near-ties began sharing the tag and
 *    the whole tiki shelf came out as Summer, Autumn. Matching is anchored to a word
 *    start now -- "applejack" still counts, "pineapple" does not. Same fix covers
 *    "melon" inside "watermelon" and "pear" inside "spear".
 *
 * Run tagSeason.
 */
var SEASON_COL = COL('Season');
var SEASON_REBUILD_ALL = false;
var SEASON_OVERRIDE = {
  // 'Drink Name': 'Winter'
};

/* How close a runner-up has to be to share the tag. 0.5 means an exact tie, and
   anything half a point behind, comes along too. Raise it and seasons blur; set it
   to 0 and only outright ties share. */
var SEASON_SHARE_WITHIN = 0.5;

var S_STYLE=COL('Style'), S_NAME=COL('Name'), S_GARNISH=COL('Garnish/Comments');

function tagSeason(){
  var ss=SpreadsheetApp.getActive(), sh=ss.getSheetByName('Cocktails');
  var last=sh.getLastRow();
  var ING=codexIngCols_();
  var wide=Math.max(SEASON_COL,S_STYLE,S_NAME,S_GARNISH,
                    ING.reduce(function(m,g){return Math.max(m,g.col);},0));
  var data=sh.getRange(1,1,last,wide).getValues();
  var out=[], notes=[], filled=0, kept=0, overrode=0, multi=0;

  for(var r=1;r<last;r++){
    var name=data[r][S_NAME-1];
    if(!name){ out.push(['']); notes.push(['']); continue; }
    name=String(name).trim();
    var existing=String(data[r][SEASON_COL-1]||'').trim();

    if(SEASON_OVERRIDE.hasOwnProperty(name)){
      out.push([SEASON_OVERRIDE[name]]); notes.push(['Manual override']); overrode++; continue;
    }
    if(existing && !SEASON_REBUILD_ALL){
      out.push([existing]); notes.push(['']); kept++; continue;
    }

    var names='';
    for(var c=0;c<ING.length;c++){ var v=data[r][ING[c].idx]; if(v) names+=' '+String(v).toLowerCase(); }
    var txt=names+' '+String(data[r][S_GARNISH-1]||'').toLowerCase()+' '+
            String(data[r][S_STYLE-1]||'').toLowerCase()+' '+name.toLowerCase();
    var se=seasonFor_(txt);
    out.push([se]); notes.push([se?'Derived from ingredients':'']);
    if(se){ filled++; if(se.indexOf(',')>-1) multi++; }
  }

  sh.getRange(2,SEASON_COL,out.length,1).setValues(out).setNotes(notes);
  var msg = SEASON_REBUILD_ALL
    ? 'REBUILT ALL — recomputed '+filled+' seasons ('+multi+' with more than one, '+overrode+' overrides).'
    : 'Filled '+filled+' blank seasons ('+multi+' with more than one); kept '+kept+' of yours ('+overrode+' overrides).';
  ss.toast(msg,'Cocktail Codex — Season',8);
  Logger.log(msg);
}

/* WORD-START matching, not substring.
   The old indexOf test meant "apple" matched inside "pineapple", so 172 pineapple
   drinks were quietly scoring Autumn +2. Summer usually still won outright, so it
   never showed -- until near-ties started sharing the tag and every tiki drink
   turned up as Summer, Autumn. "melon" inside "watermelon" and "pear" inside
   "spear" were doing the same on a smaller scale.
   Anchoring to a word start keeps "applejack" and "peppermint" working while
   "pineapple" no longer counts as apple. */
function seasonHas_(txt){
  for(var i=1;i<arguments.length;i++){
    var w=arguments[i];
    if(w.charAt(w.length-1)===' '){ if(txt.indexOf(w)>-1) return true; continue; }  // 'hot ' stays literal
    if(new RegExp('(^|[^a-z])'+w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).test(txt)) return true;
  }
  return false;
}

function seasonFor_(txt){
  var sc={Spring:0,Summer:0,Autumn:0,Winter:0};

  // ---- Summer
  if(seasonHas_(txt,'pineapple','coconut','orgeat','falernum','passion fruit','passionfruit','watermelon','melon','mango','guava')) sc.Summer+=2;
  if(seasonHas_(txt,'soda','tonic','seltzer','sparkling','ginger beer')) sc.Summer+=1;
  if(txt.indexOf('tiki')>-1||txt.indexOf('spritz')>-1) sc.Summer+=2;

  // ---- shared: a cucumber or basil drink is as much Spring as Summer, and scoring
  //      it for both is what lets it come out as both rather than arbitrarily one
  if(seasonHas_(txt,'cucumber','basil')){ sc.Summer+=1; sc.Spring+=1; }

  // ---- Spring
  if(seasonHas_(txt,'elderflower','st germain','st-germain','violette','lavender','chamomile',
                    'rhubarb','hibiscus','orange flower','rose water','apricot','snap pea',
                    'matcha','jasmine','green tea')) sc.Spring+=2;
  if(seasonHas_(txt,'strawberry','strawberries')) sc.Spring+=2;   // was 1, and so never tagged alone
  // peppermint and spearmint listed explicitly: word-start matching will not find
  // 'mint' inside them, and loosening the matcher to catch them would bring back
  // 'apple' inside 'pineapple'
  if(seasonHas_(txt,'mint','peppermint','spearmint','green chartreuse','lillet','celery','elderberry')) sc.Spring+=1;

  // ---- Autumn
  if(seasonHas_(txt,'apple','applejack','calvados','pear','maple','pumpkin','cranberry','cider','sage','fig')) sc.Autumn+=2;
  if(seasonHas_(txt,'allspice','pimento')) sc.Autumn+=1;

  // ---- Winter
  if(seasonHas_(txt,'hot ','toddy','nog','mulled','wassail','buttered')) sc.Winter+=3;
  if(seasonHas_(txt,'heavy cream','coffee','espresso','cold brew','chocolate','mole','baileys','irish cream')) sc.Winter+=2;
  if(seasonHas_(txt,'cinnamon','clove','nutmeg','baking spice')) sc.Winter+=1;
  if(txt.indexOf('spirit-forward')>-1) sc.Winter+=1;
  if(seasonHas_(txt,'cognac','scotch','port')) sc.Winter+=0.5;

  var bv=0, k;
  for(k in sc) if(sc[k]>bv) bv=sc[k];
  if(bv<2) return '';
  /* Everything within SEASON_SHARE_WITHIN of the winner shares the tag. The old code
     took the first key at the top score, which made property order the tie-breaker. */
  var win=[];
  for(k in sc) if(sc[k]>=2 && sc[k]>=bv-SEASON_SHARE_WITHIN) win.push(k);
  return win.join(', ');
}