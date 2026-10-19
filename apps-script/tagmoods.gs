/**
 * Cocktail Codex — Tag Moods  (v1)
 * --------------------------------
 * Owns column AU (Mood). Extracted from CodexMaintenance.gs's autoTagBlanks(),
 * which was doing Mood, Season AND Holiday in one pass — a problem now that
 * TagHolidays.gs owns Holiday. One column, one owner.
 *
 * DEFAULT BEHAVIOUR IS SAFE: fills only BLANK Mood cells and never touches one
 * you've filled in, exactly like autoTagBlanks did. Your hand curation survives.
 *
 * Two escape hatches:
 *   MOOD_OVERRIDE   — force a specific mood string for a named drink. Always wins.
 *   MOOD_REBUILD_ALL — set true to recompute EVERY row from scratch. This DOES
 *                      overwrite hand-entered moods, so leave it false unless you
 *                      deliberately want a clean rebuild.
 *
 * Vocabulary is locked to your eight values: Tropical, Bitter, Citrusy, Herbal,
 * Smoky, Tall, Creamy, Boozy. (The old deriveMood_ could emit a ninth value,
 * "Classic", which isn't in your Mood vocabulary and would have created a stray
 * filter chip. It's gone — Boozy covers that case.)
 *
 * Run tagMoods.
 */
var MOOD_COL = COL('Mood');            // resolved by header, see Config.gs
var MOOD_REBUILD_ALL = false;     // true = recompute every row (overwrites yours)
var MOOD_CAP = 3;                 // max moods per drink, before the sticky rule

var MOOD_OVERRIDE = {
  // 'Drink Name': 'Boozy, Bitter'
};

// Canonical order — output always follows this, so the strings stay consistent.
var MOOD_ORDER = ['Tropical','Bitter','Citrusy','Herbal','Smoky','Tall','Creamy','Boozy'];

var MOOD_STYLE_COL = COL('Style'), MOOD_NAME_COL = COL('Name');

function tagMoods(){
  var ss=SpreadsheetApp.getActive(), sh=ss.getSheetByName('Cocktails');
  var last=sh.getLastRow();
  var ING=codexIngCols_();               // ingredient columns, by header
  var wide=Math.max(MOOD_COL, MOOD_STYLE_COL, MOOD_NAME_COL,
                    ING.reduce(function(m,g){return Math.max(m,g.col);},0));
  var data=sh.getRange(1,1,last,wide).getValues();
  var out=[], notes=[], filled=0, rebuilt=0, kept=0, overrode=0;

  for(var r=1;r<last;r++){
    var name=data[r][MOOD_NAME_COL-1];
    if(!name){ out.push(['']); notes.push(['']); continue; }
    name=String(name).trim();
    var existing=String(data[r][MOOD_COL-1]||'').trim();

    if(MOOD_OVERRIDE.hasOwnProperty(name)){
      out.push([MOOD_OVERRIDE[name]]); notes.push(['Manual override']); overrode++; continue;
    }
    if(existing && !MOOD_REBUILD_ALL){
      out.push([existing]); notes.push(['']); kept++; continue;   // leave your work alone
    }

    var names='';
    for(var c=0;c<ING.length;c++){
      var v=data[r][ING[c].idx];
      if(v) names+=' '+String(v).toLowerCase();
    }
    var style=String(data[r][MOOD_STYLE_COL-1]||'').toLowerCase();
    var mo=moodFor_(style,names);
    out.push([mo]); notes.push([mo?'Derived from ingredients':'']);
    if(existing) rebuilt++; else if(mo) filled++;
  }

  sh.getRange(2,MOOD_COL,out.length,1).setValues(out).setNotes(notes);
  var msg = MOOD_REBUILD_ALL
    ? 'REBUILT ALL — recomputed '+(filled+rebuilt)+' moods ('+overrode+' overrides).'
    : 'Filled '+filled+' blank moods; kept '+kept+' of yours untouched ('+overrode+' overrides).';
  ss.toast(msg,'Cocktail Codex — Moods',8);
  Logger.log(msg);
}

function moodHas_(txt){
  for(var i=1;i<arguments.length;i++){ if(txt.indexOf(arguments[i])>-1) return true; }
  return false;
}

function moodFor_(style,names){
  var m={};
  if(style.indexOf('tiki')>-1 || moodHas_(names,'orgeat','falernum','pineapple','coconut')) m['Tropical']=1;
  if(/\b(campari|aperol|amaro|fernet|cynar|suze|bianco|amaretto|averna|nonino)\b/.test(names)) m['Bitter']=1;
  var hasCitrus = moodHas_(names,'lime juice','lemon juice','grapefruit juice','yuzu');
  if(hasCitrus) m['Citrusy']=1;
  if(moodHas_(names,'chartreuse','absinthe','benedictine') || /\bmint\b/.test(names)) m['Herbal']=1;
  var isSmoky = /\b(mezcal|mescal|lapsang|islay|peated|laphroaig|lagavulin|ardbeg|caol ila|bowmore|talisker)\b/.test(names)
             || moodHas_(names,'smoked','smoke','smoky','smokey');
  if(isSmoky) m['Smoky']=1;
  var hasTall = moodHas_(names,'soda','tonic','ginger beer','seltzer','sparkling');
  if(hasTall) m['Tall']=1;
  if(moodHas_(names,'egg white','heavy cream','coconut cream','baileys','milk')) m['Creamy']=1;
  // Boozy is the fallback for anything neither sour nor tall — no citrus, no lengthener.
  if(style.indexOf('spirit-forward')>-1 || (!hasCitrus && !hasTall)) m['Boozy']=1;

  var out=[];
  for(var i=0;i<MOOD_ORDER.length;i++){
    if(m[MOOD_ORDER[i]]) out.push(MOOD_ORDER[i]);
    if(out.length>=MOOD_CAP) break;
  }
  // Smoky is sticky — it's the most distinctive mood and shouldn't lose to the cap.
  if(isSmoky && out.indexOf('Smoky')<0) out.push('Smoky');
  if(!out.length) out.push('Boozy');
  return out.join(', ');
}