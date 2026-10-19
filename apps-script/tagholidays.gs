/**
 * Cocktail Codex — Tag Holidays  (v1)
 * -----------------------------------
 * Writes a "Holiday" to column AW (49). Unlike Family, holiday assignment is
 * taste-driven rather than structural, so this script is CURATION-FIRST:
 *
 *   1) HOL_MEMBERS — explicit, hand-curated lists. This is the primary mechanism.
 *      Your judgement lives here and survives every re-run.
 *   2) HOL_RULES   — a small rule layer for the cases where a holiday genuinely
 *      has an ingredient signature. Right now that's just St. Patrick's (Irish
 *      whiskey), which is the one holiday that maps cleanly onto a bottle.
 *
 * An explicit member always beats a rule. A drink in no list and matching no rule
 * gets a blank cell.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * v2: FILLS BLANKS ONLY. THE SHEET WINS.
 *
 * v1 rewrote the whole column, so anything you typed into a Holiday cell was
 * silently reverted on the next run. That is exactly backwards: a hand entry is
 * a decision, and a rule that failed once will fail identically every time.
 *
 * Now a populated cell is never touched -- not by a rule, and not by HOL_MEMBERS
 * either. Type Valentine's onto Cupid's Cup and it stays there forever. Adding
 * the drink to HOL_MEMBERS as well is optional; the only thing it buys you is
 * re-tagging if the cell is ever emptied.
 *
 * The script's job is the FIRST PASS on blanks: add 20 drinks, run it, review
 * the 20 it guessed at, correct them in the sheet. Nothing else moves.
 *
 * DISAGREEMENTS are reported, never applied. If a populated cell differs from
 * what the rules would now produce, the run logs it so you can see where your
 * judgement and the lists have drifted apart -- without changing anything.
 *
 * TO FORCE A REBUILD of a row: clear the cell and re-run.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * ADDING A DRINK: put its exact Name into the right array below, or just type the
 * holiday into the sheet. Newly-filled cells get a note saying whether they came
 * from the list or a rule; preserved cells keep whatever note they already had.
 *
 * Run tagHolidays. Re-runnable and non-destructive. Depends on nothing except the
 * Cocktails sheet.
 */
var HOL_COL = COL('Holiday');          // resolved by header, see Config.gs

/* ---------------- curated membership ---------------- */
var HOL_MEMBERS = {

  'Halloween': [
    // existing
    'Corpse Reviver','Corpse Reviver No. 2','Zombie','Witches Daiquiri','Witches Grappa',
    'King of Barbados','Haunting Hacienda','Blood Orange Margarita','Blood Moon','The Goblin',
    "The Devil's Margarita",'Bible John','The Old Haunt','The Midnight Daisy','The Black Lantern',
    "Widow's Kiss",'Italian Zombie','The Devils Soul','The Kill Devil',
    // added
    'See No Evil','Speak No Evil','Oaxacan Dead','Cradle to the Grave','Muerto Vivo',
    "Black Beard's Ghost"
  ],

  'Christmas': [
    // existing
    'Egg Nog','Wassail','Gingerbread','Winter Julep','Pog Nog','Gregnog',
    // added
    'Black Christmas','Hot Christmas Punch',"Santa's Secret Handshake",
    'White Christmas Margarita','Yule Tidal Wave',
    'Camparinara',  // punch addition
    'Jingle Bird'   // moved off Thanksgiving
  ],

  'Thanksgiving': [
    'Peach & Sage Smash','Captains Grog','Why Not','The Cosmopolitan','Ply & Pin',
    'Quadresse','Washington Apple','Crimson Art'
  ],

  "Valentine's": [
    'The Casper','Juliet & Romeo','Clover Club','Left Hand','Chocolate Covered Cherries',
    'Yacht Rock','The Lovebird'
  ],

  "New Year's": [
    'Boathouse Punch','Quarter Century','Rebel Flip','Hollywood Hustler','Watermelon Slice'
  ]

  // "St. Patrick's" is intentionally absent — it's fully rule-driven below, which
  // catches every Irish-whiskey drink you add from here on without any bookkeeping.
  // Add a 'St. Patrick's' array here if you ever want to force in a non-Irish drink.
};

/* ---------------- rule layer ---------------- */
// Ingredient-signature rules, applied only when no curated list claims the drink.
// Each entry: [holiday, regex tested against the drink's joined ingredient names].
var HOL_RULES = [
  ["St. Patrick's", /irish whiskey|irish cream|jameson|redbreast|green spot|powers/i]
];

function tagHolidays(){
  var ss=SpreadsheetApp.getActive(), cs=ss.getSheetByName('Cocktails');
  var cl=cs.getLastRow();
  var NAMEC=COL('Name'), ING=codexIngCols_();
  var wide=Math.max(NAMEC, ING.reduce(function(m,g){return Math.max(m,g.col);},0));
  var data=cs.getRange(2,1,cl-1,wide).getValues();
  // Seed the output from what is ALREADY in the column. This is the whole safety
  // mechanism: setValues() writes every cell in the range, so an array built from
  // empties would blank the very rows we are trying to protect -- and it would not
  // error. Read first, then only overwrite the blanks.
  var curVals=cs.getRange(2,HOL_COL,cl-1,1).getValues();
  var curNotes=cs.getRange(2,HOL_COL,cl-1,1).getNotes();

  // invert the curated lists into a name -> holiday lookup, flagging collisions
  var byName={}, dupes=[];
  for(var hol in HOL_MEMBERS){
    var arr=HOL_MEMBERS[hol];
    for(var i=0;i<arr.length;i++){
      var key=holKey_(arr[i]);
      if(byName.hasOwnProperty(key) && byName[key]!==hol) dupes.push(arr[i]+' ('+byName[key]+' vs '+hol+')');
      byName[key]=hol;
    }
  }

  var out=[], notes=[], counts={}, fromList=0, fromRule=0, unmatched=[];
  var kept=0, disagree=[];
  var listed={};   // track which curated names we actually found in the sheet

  for(var r=0;r<data.length;r++){
    var row=data[r], name=row[NAMEC-1];
    var existing=String(curVals[r][0]==null?'':curVals[r][0]).trim();
    if(!name){ out.push([curVals[r][0]]); notes.push([curNotes[r][0]]); continue; }
    name=String(name).trim();
    var key=holKey_(name);

    // Classify EVERY row, including ones we are about to leave alone. The curated
    // lists are checked here even for preserved cells, so listed[] stays accurate
    // and a genuine typo in HOL_MEMBERS still shows up as NOT FOUND. Skipping the
    // classification for populated rows would report every already-tagged curated
    // drink as missing.
    var hol='', note='';
    if(byName.hasOwnProperty(key)){
      hol=byName[key]; note='Curated list'; listed[key]=true;
    } else {
      var ing=[];
      for(var c=0;c<ING.length;c++){ var v=row[ING[c].idx]; if(v!==''&&v!=null&&String(v).trim()!=='') ing.push(String(v).trim()); }
      var blob=ing.join(' | ');
      for(var k=0;k<HOL_RULES.length;k++){
        if(HOL_RULES[k][1].test(blob)){ hol=HOL_RULES[k][0]; note='Matched rule: '+hol; break; }
      }
    }

    if(existing){
      // THE SHEET WINS. Keep the value and its note untouched.
      out.push([curVals[r][0]]); notes.push([curNotes[r][0]]); kept++;
      if(hol && hol!==existing) disagree.push(name+': sheet "'+existing+'" vs rules "'+hol+'"');
      counts[existing]=(counts[existing]||0)+1;
    } else {
      out.push([hol]); notes.push([note]);
      if(hol){
        counts[hol]=(counts[hol]||0)+1;
        if(note==='Curated list') fromList++; else fromRule++;
      }
    }
  }

  // any curated name that never matched a row is a typo worth surfacing
  for(var kk in byName) if(!listed[kk]) unmatched.push(kk);

  cs.getRange(1,HOL_COL).setValue('Holiday').setFontWeight('bold');
  cs.getRange(2,HOL_COL,out.length,1).setValues(out).setNotes(notes);

  var total=0, parts=[];
  for(var h in counts){ total+=counts[h]; parts.push(h+' '+counts[h]); }
  var added=fromList+fromRule;
  var msg=total+' tagged  ('+parts.sort().join(', ')+')  |  '+added+' newly filled, '+kept+' preserved';
  if(disagree.length) msg+='  |  '+disagree.length+' disagree with the rules (see log)';
  if(unmatched.length) msg+='  |  NOT FOUND: '+unmatched.join(', ');
  if(dupes.length)     msg+='  |  IN TWO LISTS: '+dupes.join(', ');
  ss.toast(msg,'Cocktail Codex — Holidays',12);
  var log=msg+'\n  newly filled from curated lists: '+fromList
             +'\n  newly filled from rules: '+fromRule
             +'\n  left alone (already populated): '+kept;
  if(disagree.length){
    log+='\n\nSHEET DISAGREES WITH THE RULES ('+disagree.length+') — nothing was changed.'
       + '\nEach of these is a populated cell the rules would have filled differently:\n  '
       + disagree.join('\n  ');
  }
  Logger.log(log);
}

// Loose key so a curly apostrophe, stray spacing, or case difference in a curated
// list still matches the sheet.
function holKey_(s){
  return String(s).toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/g,"'")
    .replace(/\s+/g,' ')
    .trim();
}