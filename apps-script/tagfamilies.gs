/**
 * Cocktail Codex — Tag Families  (structure + description, v4)
 * -----------------------------------------------------------
 * Writes a "Family" to column AX (50) from ingredient STRUCTURE, then uses the
 * recipe DESCRIPTION as a second signal. Specific named families only (Sour and
 * Tiki are Style categories, not families). Blank when nothing fits.
 *
 * v4 changes (9 new families + 2 fixes):
 *  - ORGEAT is now its own role, split out of the tikisyrup bucket. The `tiki`
 *    exclusion still counts it, so every v3 rule behaves exactly as before.
 *  - MAI TAI (new): rum-or-agave base (no gin/whiskey/brandy/vodka) + citrus +
 *    orgeat-class + orange liqueur; no soda, swizzle, or highball. PLUS a name
 *    override — anything literally named "... Mai Tai" tags Mai Tai even when the
 *    riff swaps curaçao for allspice/chartreuse/banana liqueur.
 *  - FOG CUTTER (new): orgeat + sherry + 3 or more base spirits + citrus.
 *  - SCORPION (new): orgeat + orange/pineapple juice + citrus + 2+ bases, no curaçao.
 *  - PIÑA COLADA (new): rum + coconut + pineapple. Painkiller folds in as a member.
 *  - HURRICANE (new): rum + passionfruit (incl. fassionola) + citrus, no bitter
 *    aperitif / herbal-liqueur / maraschino, and either 2+ rums or a second juice.
 *  - PENICILLIN (new): whiskey + citrus + honey. Named for the most recognizable
 *    member rather than the strictly-older Gold Rush; the Gold Rush itself tags
 *    into this family, and both names are accepted as description cues.
 *  - BEE'S KNEES (new): gin + lemon + honey, no soda.
 *  - GIMLET (new): gin/vodka only + lime + sweetener, <=5 ingredients — closes the
 *    gap where gin sours had no family at all.
 *  - ESPRESSO MARTINI (new): coffee element, no citrus/bitters/dairy/vermouth/
 *    bitter aperitif, not served hot. Coffee OLD FASHIONEDS keep their bitters and
 *    so stay Old Fashioned.
 *  - MOJITO (new): rum + lime + mint + soda. Swizzles stay out (no soda).
 *  - SIDECAR FIX: now excludes orgeat, which stops it swallowing the two Fog Cutters.
 *
 * v4.1: famEqual_ no longer counts dash-measured ingredients (bitters, saline,
 * absinthe, tinctures) as ounces — that bug was silently breaking all three
 * formula families. Naked & Famous no longer requires an agave base, since these
 * are formulas with a swappable base spirit.
 *
 * v7: NAME CUE — a drink named for a template ('Mezcal Daiquiri', 'Cottonwood
 * Margarita') tags to that family, gated on style. Margarita now requires
 * Style='Sour'; structural Negroni refuses Tiki builds.
 *
 * v6: STYLE GUARDS. The Style column now vetoes families it structurally cannot
 * be — Old Fashioned requires Style='Old Fashioned', and the sour/spirit-forward
 * families refuse Punch, Toddy, Flip and Highball builds. This replaces 14
 * one-off overrides with a rule that also catches future entries.
 *
 * v8: FILLS BLANKS ONLY. THE SHEET WINS.
 *
 * Through v7 this rewrote the whole column, so a correction typed into a Family
 * cell was silently reverted on the next run. Now a populated cell is never
 * touched -- not by structure, not by the description cue, and not by
 * FAM_OVERRIDE either. The sheet is authoritative, full stop.
 *
 * The script's job is the FIRST PASS on blanks: add 20 drinks, run it, review the
 * 20 it guessed at, fix them in the sheet. The other 900 rows do not move.
 *
 * DISAGREEMENTS are reported, never applied. Where a populated cell differs from
 * what the classifier would now produce, the run logs it -- so a rule change that
 * would have reclassified 30 drinks is visible without touching any of them.
 *
 * TO FORCE A REBUILD of a row: clear the cell and re-run. To rebuild the whole
 * column, clear the column and re-run.
 *
 * Run tagFamilies. Re-runnable and non-destructive. Also seeds an empty "Era"
 * header if it is missing. Depends on RC_TAB (Config.gs).
 */
var FAM_COL = COL('Family'), ERA_COL = COL('Era');   // resolved by header, see Config.gs

/**
 * MANUAL OVERRIDES — kept, but mostly historical now.
 *
 * These existed because the classifier used to overwrite the column, so a
 * correction had to live in code to survive. As of v8 it does not: type the family
 * into the sheet and it stays. A populated cell beats this table.
 *
 * What FAM_OVERRIDE still does: it wins over structure and description for a
 * BLANK cell. So it is the right place for an arbitration you want applied
 * automatically to future re-runs (or if you ever clear the column and rebuild),
 * and the wrong place for a one-off fix -- just type that in the sheet.
 *
 * The three below are already populated in the sheet, so they are currently inert.
 * Harmless, and they document the arbitration.
 */
var FAM_OVERRIDE = {
  'Four Points': 'Last Word',        // description explicitly calls it a Last Word
  'The Getaway Car': 'Jungle Bird',  // hand-tagged; structure reads as a Daiquiri
  // Left Hand / Linden Square are no longer pinned — the base:modifier ratio
  // tie-break now resolves them (1.00 -> Negroni, 2.00 -> Manhattan).
  'Medicina Latina': 'Penicillin'    // agave build; structure reads Margarita

  // The 14 style-based blanks that used to live here are gone — the Style guards in
  // classifyFamily_ (Old Fashioned requires Style='Old Fashioned'; the sour and
  // spirit-forward families refuse Punch/Toddy/Flip/Highball) now handle them, and
  // caught Killer on Ice and Pina Noir too. Only genuine one-offs belong here.
};

function tagFamilies(){
  var ss=SpreadsheetApp.getActive();
  var cs=ss.getSheetByName('Cocktails'), as=ss.getSheetByName(RC_TAB);
  var AMT={}, al=as.getLastRow();
  if(al>=2){ var av=as.getRange(2,1,al-1,5).getValues(); for(var i=0;i<av.length;i++){ if(av[i][0]) AMT[String(av[i][0])]=av[i][4]; } }

  var cl=cs.getLastRow();
  var C_STYLE=COL('Style'), C_NAME=COL('Name'), C_SERVED=COL('Served'), C_DESC=COL('YT_Description');
  var ING=codexIngCols_();
  var wide=Math.max(C_STYLE,C_NAME,C_SERVED,C_DESC,
                    ING.reduce(function(m,g){return Math.max(m,g.col);},0));
  var data=cs.getRange(2,1,cl-1,wide).getValues();
  // Seed from what is ALREADY in the column. setValues() writes the whole range, so
  // an array built up from empties would blank exactly the rows we mean to protect,
  // and it would do it without erroring. Read first; overwrite only the blanks.
  var curVals=cs.getRange(2,FAM_COL,cl-1,1).getValues();
  var curNotes=cs.getRange(2,FAM_COL,cl-1,1).getNotes();
  var out=[], notes=[], counts={}, filledFromDesc=0, descDiff=0;
  var kept=0, disagree=[];

  for(var r=0;r<data.length;r++){
    var row=data[r], name=row[C_NAME-1];
    var existing=String(curVals[r][0]==null?'':curVals[r][0]).trim();
    if(!name){ out.push([curVals[r][0]]); notes.push([curNotes[r][0]]); continue; }
    name=String(name).trim();
    var style=String(row[C_STYLE-1]||''), served=String(row[C_SERVED-1]||''), desc=String(row[C_DESC-1]||'');
    var ings=[], seen={};
    for(var gi=0;gi<ING.length;gi++){ var v=row[ING[gi].idx]; if(v===''||v==null||String(v).trim()==='') continue;
      var ing=String(v).trim(), occ=seen[ing]||0; seen[ing]=occ+1;
      ings.push([ing, AMT[occ===0?name+'|'+ing:name+'|'+ing+'|'+(occ+1)]]); }

    var fam='', note='';
    if(FAM_OVERRIDE.hasOwnProperty(name)){
      fam=FAM_OVERRIDE[name]; note='Manual override';
    } else {
      var structural=classifyFamily_(ings, name, style, served);
      var descFam=famFromDescription_(desc);
      fam=structural;
      if(!fam && descFam){ fam=descFam; note='Family inferred from description'; }
      else if(fam && descFam && descFam!==fam){ note='Description suggests: '+descFam; }
    }

    if(existing){
      // THE SHEET WINS. Value and note both survive untouched.
      out.push([curVals[r][0]]); notes.push([curNotes[r][0]]); kept++;
      if(fam && fam!==existing) disagree.push(name+': sheet "'+existing+'" vs classifier "'+fam+'"');
      counts[existing]=(counts[existing]||0)+1;
    } else {
      out.push([fam]); notes.push([note]);
      counts[fam||'—']=(counts[fam||'—']||0)+1;
      if(fam && note==='Family inferred from description') filledFromDesc++;
      if(fam && note.indexOf('Description suggests')===0) descDiff++;
    }
  }

  cs.getRange(1,FAM_COL).setValue('Family').setFontWeight('bold');
  cs.getRange(2,FAM_COL,out.length,1).setValues(out).setNotes(notes);
  if(!cs.getRange(1,ERA_COL).getValue()) cs.getRange(1,ERA_COL).setValue('Era').setFontWeight('bold');

  var tagged=0,total=0; for(var k in counts){ total+=counts[k]; if(k!=='—') tagged+=counts[k]; }
  var msg='Tagged '+tagged+'/'+total+'.  '+kept+' preserved (sheet wins), '
        + filledFromDesc+' newly filled from descriptions';
  if(disagree.length) msg+=', '+disagree.length+' disagree with the classifier (see log)';
  ss.toast(msg+'.','Cocktail Codex',10);
  var log=msg+'.\n  left alone (already populated): '+kept
             +'\n  description-vs-structure notes on new fills: '+descDiff;
  if(disagree.length){
    log+='\n\nSHEET DISAGREES WITH THE CLASSIFIER ('+disagree.length+') — nothing was changed.'
       + '\nEach is a populated cell the classifier would have filled differently:\n  '
       + disagree.join('\n  ');
  }
  Logger.log(log);
}

/* ---------------- role table ---------------- */
var FAM_ROLE=[['sweet vermouth','sweetverm'],['rosso','sweetverm'],['carpano','sweetverm'],['punt e mes','sweetverm'],
 ['dry vermouth','dryverm'],['blanc vermouth','dryverm'],['bianco vermouth','dryverm'],
 ['green chartreuse','herbliq'],['yellow chartreuse','herbliq'],['chartreuse','herbliq'],['benedictine','herbliq'],['genepy','herbliq'],['strega','herbliq'],
 ['orange liqueur','orangeliq'],['triple sec','orangeliq'],['cointreau','orangeliq'],['curacao','orangeliq'],['curaçao','orangeliq'],['grand marnier','orangeliq'],
 ['angostura','bitters'],['peychaud','bitters'],['orange bitters','bitters'],['chocolate bitters','bitters'],['mole bitters','bitters'],['bitters','bitters'],
 ['campari','bitteraperitif'],['aperol','bitteraperitif'],['cynar','bitteraperitif'],['suze','bitteraperitif'],['gran classico','bitteraperitif'],['contratto','bitteraperitif'],['bitter bianco','bitteraperitif'],['bianco bitter','bitteraperitif'],['sfumato','bitteraperitif'],
 ['nonino','amaro'],['averna','amaro'],['montenegro','amaro'],['nardini','amaro'],['ramazzotti','amaro'],['braulio','amaro'],['amaro','amaro'],['fernet','amaro'],
 ['luxardo','maraschino'],['maraschino','maraschino'],
 /* substring guards — must precede the base spirits: "ginger" contains "gin",
    "oleo-saccharum" contains "rum". Both resolve to sweet; ginger beer is still
    caught as soda by famHasSoda_. */
 ['ginger','sweet'],['oleo-saccharum','sweet'],['oleo saccharum','sweet'],
 ['tequila','agave'],['mezcal','agave'],['agave spirit','agave'],['raicilla','agave'],['sotol','agave'],
 ['rhum','rum'],['cachaca','rum'],['cachaça','rum'],['charanda','rum'],['clairin','rum'],['rum','rum'],
 ['bourbon','whiskey'],['rye','whiskey'],['scotch','whiskey'],['whiskey','whiskey'],['whisky','whiskey'],
 ['cognac','brandy'],['brandy','brandy'],['pisco','brandy'],['armagnac','brandy'],['calvados','brandy'],['apple brandy','brandy'],
 ['gin','gin'],['genever','gin'],['vodka','vodka'],
 ['orgeat','orgeat'],['almond syrup','orgeat'],
 ['falernum','tikisyrup'],['passion','tikisyrup'],['fassionola','tikisyrup'],['cinnamon syrup','tikisyrup'],
 ['pineapple','pineapple'],['coconut','coconut'],
 ['agave nectar','sweet'],['agave syrup','sweet'],['simple syrup','sweet'],['honey syrup','sweet'],['honey','sweet'],['demerara','sweet'],['gomme','sweet'],['rich simple','sweet'],['maple','sweet'],['sugar','sweet'],['cane syrup','sweet'],['syrup','sweet'],
 ['prosecco','bubbles'],['champagne','bubbles'],['sparkling','bubbles'],['cava','bubbles'],
 ['lime','citrus'],['lemon','citrus'],['grapefruit','citrus'],['yuzu','citrus']];

function famNorm_(s){ return String(s).toLowerCase().replace(/\s+/g,' ').trim(); }
function famRoles_(names){ var rs={}; for(var i=0;i<names.length;i++){ var n=famNorm_(names[i]);
  for(var j=0;j<FAM_ROLE.length;j++){ if(n.indexOf(FAM_ROLE[j][0])>-1){ rs[FAM_ROLE[j][1]]=(rs[FAM_ROLE[j][1]]||0)+1; break; } } } return rs; }
function famHasLime_(names){ for(var i=0;i<names.length;i++) if(famNorm_(names[i]).indexOf('lime')>-1) return true; return false; }
function famHasSoda_(names){ for(var i=0;i<names.length;i++) if(/soda|tonic|seltzer|sparkling water|ginger beer|club/.test(famNorm_(names[i]))) return true; return false; }
// Ingredients measured in DASHES/DROPS rather than ounces. Their numeric amount is
// a dash count ("3 Saline Solution"), so including them wrecks the equal-parts
// spread and silently breaks the formula families (Last Word, Paper Plane,
// Naked & Famous). They are excluded from the ratio, never from the role check.
var FAM_DASHED=/bitters|saline|tincture|absinthe|rose water|orange flower|extract|essence|rinse|float of/i;
function famEqual_(ings){ var oz=[];
  for(var i=0;i<ings.length;i++){
    if(typeof ings[i][1]!=='number') continue;
    if(FAM_DASHED.test(String(ings[i][0]))) continue;   // dash-measured, not a formula part
    oz.push(ings[i][1]); }
  if(oz.length<3) return false; return (Math.max.apply(null,oz)-Math.min.apply(null,oz))<=0.30; }
/* v4 helpers — direct ingredient probes for things the role table can't isolate */
// Base-spirit oz : modifier oz. Diagnostic INSIDE an ambiguous structural zone
// (see the Negroni/Manhattan tie-break) but never a family definition on its own —
// Manhattan-family ratios legitimately run 0.60 (Vieux Carre) to 4.00 (Greenpoint).
var FAM_BASE_R=['gin','rum','whiskey','agave','brandy','vodka'];
var FAM_MOD_R=['sweetverm','dryverm','bitteraperitif','amaro','herbliq','maraschino','orangeliq'];
function famRatio_(ings){ var b=0,m=0;
  for(var i=0;i<ings.length;i++){ var amt=ings[i][1];
    if(typeof amt!=='number'||FAM_DASHED.test(String(ings[i][0]))) continue;
    var R=famRoles_([ings[i][0]]), isB=false, isM=false;
    for(var k=0;k<FAM_BASE_R.length;k++) if(R[FAM_BASE_R[k]]) isB=true;
    for(var k2=0;k2<FAM_MOD_R.length;k2++) if(R[FAM_MOD_R[k2]]) isM=true;
    if(isB) b+=amt; else if(isM) m+=amt; }
  return (b>0&&m>0)?(b/m):null; }
function famAny_(names,rx){ for(var i=0;i<names.length;i++) if(rx.test(famNorm_(names[i]))) return true; return false; }
function famBaseCount_(R){ var k=['rum','gin','whiskey','agave','brandy','vodka'], n=0;
  for(var i=0;i<k.length;i++) if((R[k[i]]||0)>0) n++; return n; }

function classifyFamily_(ings, name, style, served){
  var names=[]; for(var i=0;i<ings.length;i++) names.push(ings[i][0]);
  var R=famRoles_(names), h=function(x){return (R[x]||0)>0;};
  var cit=h('citrus'), bit=h('bitters'), n=names.length;
  // sweet is role-OR-probe so a specialty syrup (orgeat, passion fruit, coconut
  // cream, cinnamon) still registers as a sweetener despite owning its own role.
  var sweet=h('sweet')||famAny_(names,/syrup|honey|sugar|agave nectar|demerara|gomme|maple|cane|orgeat|falernum|grenadine/);
  var soda=famHasSoda_(names);
  // Direct probes rather than roles: the role table breaks on first match, which
  // used to hide "coconut cream syrup" and "passion fruit syrup" behind 'syrup'.
  var orgeat=famAny_(names,/orgeat|almond syrup/), coconut=famAny_(names,/coconut/),
      pineapple=famAny_(names,/pineapple/);
  // Deliberately NARROW: orgeat, falernum and fassionola are true tiki markers.
  // Passionfruit and coconut are mainstream sour ingredients — a Passion Fruit
  // Daiquiri is still a Daiquiri, and a Coconut Daiquiri is still a Daiquiri.
  var tiki=(orgeat||famAny_(names,/falernum|fassionola/));
  var base=(h('gin')||h('rum')||h('whiskey')||h('agave')||h('brandy')||h('vodka'));
  var otherBase=(h('gin')||h('whiskey')||h('agave')||h('brandy')||h('vodka'));  // non-rum bases
  var eqp=famEqual_(ings);
  var ns=(name+' '+style).toLowerCase(), sv=served.toLowerCase();
  // The Style column is authoritative. These guards replace a pile of one-off
  // overrides: a family should refuse a style it structurally cannot be.
  var tikiStyle=/tiki/i.test(style);
  // Communal / hot / egg-rich builds and tall drinks are not sours or
  // spirit-forward cocktails, however their ingredients read.
  var styleComposed=/punch|toddy|flip/i.test(style);
  var styleTall=/highball/i.test(style);
  var sourOK=(!styleComposed && !styleTall);
  // An Old Fashioned is its own style in this collection (39 of them). Anything the
  // sugar+bitters signature drags in from Martini/Toddy/Punch is a false positive.
  var styleOldFashioned=/^old fashioned$/i.test(String(style).trim());
  var styleSour=/^sour$/i.test(String(style).trim());
  // A Daiquiri is served up — or blended, since a Frozen Daiquiri is still a Daiquiri.
  var servedUp=/^(up|frozen\/blended)$/i.test(String(served).trim());
  var swizzle=/swizzle/.test(ns)||/swizzle/.test(sv);
  var highball=/highball|collins|mule|fizz|rickey|cooler|spritz|paloma/.test(ns)||/highball|collins/.test(style.toLowerCase())||/highball|collins|tall/.test(sv);
  // v4 probes
  var honey=famAny_(names,/honey/), mint=famAny_(names,/\bmint\b/), sherry=famAny_(names,/sherry/),
      dairy=famAny_(names,/cream|baileys|milk|egg/), coffee=famAny_(names,/espresso|coffee|kahlua|kahlúa|mr black|cold brew|tia maria|licor 43/),
      passion=famAny_(names,/passion|fassionola/), juice2=famAny_(names,/orange juice|pineapple juice/),
      hot=/\bhot\b|toddy|irish coffee|spanish coffee/.test(ns+' '+sv),
      nonRumBase=(h('gin')||h('whiskey')||h('brandy')||h('vodka')),
      rumCount=(R['rum']||0), bases=famBaseCount_(R);

  // A drink whose NAME asserts a template wins over the structural read — the
  // author is telling you the family ("Mezcal Daiquiri", "Nuclear Daiquiri",
  // "Cottonwood Margarita"). Gated on having a base spirit and on the style not
  // being a hard mismatch, so Punch/Toddy/Highball builds still can't sneak in.
  // Bare "martini" and "sour" are deliberately NOT in the vocabulary — far too
  // many drinks are named Martini without being in the Martini family.
  if(base && sourOK){
    var nf=famFromName_(name);
    // The name cue still respects each family's own style requirement, so a
    // "... Old Fashioned" that isn't Style='Old Fashioned' can't slip through.
    if(nf==='Old Fashioned' && !styleOldFashioned) nf='';
    if(nf==='Margarita' && !styleSour) nf='';
    if(nf==='Negroni' && tikiStyle) nf='';
    if(nf) return nf;
  }

  // formula families (equal parts + role signature)
  var mods=(R['herbliq']||0)+(R['maraschino']?1:0)+(R['orangeliq']?1:0)+(R['amaro']?1:0);
  if(eqp && cit && h('herbliq') && mods>=2 && !h('bitteraperitif') && base && sourOK) return 'Last Word';
  if(eqp && cit && h('herbliq') && h('bitteraperitif') && sourOK) return 'Naked & Famous';
  if(eqp && cit && h('bitteraperitif') && h('amaro') && sourOK) return 'Paper Plane';

  // --- orgeat-driven tiki families (must precede Margarita / Sidecar / Daiquiri) ---
  // Mai Tai: rum or agave base, no other base spirit, citrus + orgeat + orange liqueur.
  if(h('rum')||h('agave')){
    if(!nonRumBase && cit && orgeat && h('orangeliq') && !soda && !swizzle && !highball) return 'Mai Tai';
  }
  // Name override: an explicitly named "... Mai Tai" whose riff swapped out the curaçao.
  if(/\bmai tai\b/.test(name.toLowerCase()) && orgeat) return 'Mai Tai';
  if(orgeat && sherry && cit && bases>=3) return 'Fog Cutter';
  if(orgeat && juice2 && cit && bases>=2 && !h('orangeliq') && !sherry) return 'Scorpion';

  // Jungle Bird (modern classic)
  if(h('rum') && h('bitteraperitif') && h('pineapple') && cit && sweet) return 'Jungle Bird';
  // Piña Colada (Painkiller folds in here)
  if(h('rum') && coconut && pineapple) return 'Piña Colada';
  // Hurricane: multi-rum passionfruit punch, not a Jungle Bird / Last Word / Daiquiri
  if(h('rum') && passion && cit && !nonRumBase && !h('bitteraperitif') && !h('herbliq') && !h('maraschino')
     && (rumCount>=2 || juice2)) return 'Hurricane';

  // specific structural families
  if(h('agave') && famHasLime_(names) && !soda && !tiki && !tikiStyle && sourOK && styleSour && (h('orangeliq')||sweet)) return 'Margarita';
  if(h('brandy') && h('orangeliq') && cit && !soda && !orgeat && !tikiStyle && sourOK) return 'Sidecar';
  if(h('rum') && !otherBase && cit && sweet && !soda && !tiki && !swizzle && !highball && servedUp && sourOK && n<=5) return 'Daiquiri';
  if(h('whiskey') && cit && honey && !soda && !tiki && !tikiStyle && sourOK) return 'Penicillin';
  if(h('whiskey') && cit && sweet && !soda && !tiki && !tikiStyle && sourOK) return 'Whiskey Sour';
  if(h('gin') && famAny_(names,/lemon/) && honey && !soda && !tiki && sourOK) return "Bee's Knees";
  if((h('gin')||h('vodka')) && !h('rum') && !h('whiskey') && !h('agave') && !h('brandy')
     && famHasLime_(names) && sweet && n<=5 && !soda && !mint && !honey && !coffee
     && !h('sweetverm') && !h('dryverm') && !h('bitteraperitif') && !tiki && sourOK) return 'Gimlet';
  // Negroni/Manhattan overlap: whiskey + bitter aperitif + vermouth + bitters
  // satisfies BOTH signatures. Ratio arbitrates — balanced reads Negroni
  // (Boulevardier 1.00), spirit-forward reads Manhattan (2:1 and up).
  if(h('whiskey') && h('bitteraperitif') && (h('sweetverm')||h('dryverm')) && bit && !cit){
    var rr=famRatio_(ings);
    return (rr!==null && rr>=1.8) ? 'Manhattan' : 'Negroni';
  }
  // A bitter aperitif with EITHER sweet or blanc/dry vermouth is a Negroni — the
  // White/Summer/Empress Negroni builds use blanc vermouth and were falling to Martini.
  // Structural Negroni refuses Tiki builds (Yacht Rock). A drink actually NAMED
  // a Negroni still qualifies below via the name cue.
  if(base && h('bitteraperitif') && (h('sweetverm')||h('dryverm')) && !tikiStyle) return 'Negroni';
  // Name cue: "<x> Negroni" that still carries a bitter aperitif or vermouth.
  if(/\bnegroni\b/i.test(name) && (h('bitteraperitif')||h('sweetverm')||h('dryverm'))) return 'Negroni';
  if(h('whiskey') && h('sweetverm') && bit && !cit) return 'Manhattan';
  if(coffee && !cit && !bit && !dairy && !h('sweetverm') && !h('dryverm') && !h('bitteraperitif') && !hot && base) return 'Espresso Martini';
  if((h('gin')||h('vodka')) && h('dryverm') && !cit) return 'Martini';
  if(sweet && bit && !cit && base && !soda && styleOldFashioned) return 'Old Fashioned';
  if(h('rum') && famHasLime_(names) && mint && soda) return 'Mojito';
  return '';
}

/* ---------------- name cue ---------------- */
// Matched against the drink NAME. Longer/more specific phrases first.
var FAM_NAME=[
 ['espresso martini','Espresso Martini'],['naked and famous','Naked & Famous'],['naked & famous','Naked & Famous'],
 ['mai tai','Mai Tai'],['fog cutter','Fog Cutter'],['scorpion','Scorpion'],
 ['pina colada','Piña Colada'],['piña colada','Piña Colada'],['painkiller','Piña Colada'],
 ['jungle bird','Jungle Bird'],['last word','Last Word'],['paper plane','Paper Plane'],
 ['penicillin','Penicillin'],['gold rush','Penicillin'],['boulevardier','Negroni'],['negroni','Negroni'],
 ['manhattan','Manhattan'],['old fashioned','Old Fashioned'],['whiskey sour','Whiskey Sour'],
 ['daiquiri','Daiquiri'],['margarita','Margarita'],['mojito','Mojito'],['gimlet','Gimlet'],
 ["bee's knees","Bee's Knees"],['bees knees',"Bee's Knees"],['sidecar','Sidecar'],['hurricane','Hurricane']];
function famFromName_(name){
  var n=famNorm_(name);
  for(var i=0;i<FAM_NAME.length;i++) if(n.indexOf(FAM_NAME[i][0])>-1) return FAM_NAME[i][1];
  return '';
}

/* ---------------- description cue ---------------- */
// Maps a family phrase found in the description to a canonical family (ours only).
// Order matters: more specific phrases first ("espresso martini" before "martini").
var FAM_CUE=[
 ['naked and famous','Naked & Famous'],['naked & famous','Naked & Famous'],
 ['espresso martini','Espresso Martini'],
 ['last word','Last Word'],['paper plane','Paper Plane'],['jungle bird','Jungle Bird'],
 ['whiskey sour','Whiskey Sour'],['old fashioned','Old Fashioned'],['margarita','Margarita'],
 ['daiquiri','Daiquiri'],['negroni','Negroni'],['manhattan','Manhattan'],['martini','Martini'],
 ['sidecar','Sidecar'],
 ['mai tai','Mai Tai'],['fog cutter','Fog Cutter'],['scorpion','Scorpion'],
 ['piña colada','Piña Colada'],['pina colada','Piña Colada'],['painkiller','Piña Colada'],
 ['hurricane','Hurricane'],['penicillin','Penicillin'],['gold rush','Penicillin'],
 ["bee's knees","Bee's Knees"],['bees knees',"Bee's Knees"],['gimlet','Gimlet'],['mojito','Mojito']];
function famFromDescription_(desc){
  if(!desc) return '';
  var d=famNorm_(desc);
  for(var i=0;i<FAM_CUE.length;i++){
    var term=FAM_CUE[i][0];
    // strong cue: "<lead-in> (the) <family>"  OR  "<family> <riff-word>"
    var lead='(riff on|take on|twist on|spin on|variation of|variation on|version of|based on|our take on|our)\\s+(the\\s+)?';
    var tail='\\s+(riff|variation|variant|twist|spin|cousin|template)';
    var re1=new RegExp(lead+term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i');
    var re2=new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+tail,'i');
    if(re1.test(d)||re2.test(d)) return FAM_CUE[i][1];
  }
  return '';
}