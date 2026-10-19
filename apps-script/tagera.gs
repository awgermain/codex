/**
 * Cocktail Codex — Seed Era from the IBA canon
 * --------------------------------------------
 * Pre-fills the "Era" column for drinks that match the IBA 2024 official
 * cocktail list. Mapping (your choice): The Unforgettables + Contemporary Classics
 * -> "Classic"; New Era Drinks -> "Modern Classic".
 *
 * SAFE: only fills BLANK Era cells — it never overwrites an Era you set by hand, so
 * you can re-run it freely. Matches by exact drink name (the 53 confirmed matches in
 * your collection at build time); add more by hand for variants it can't see.
 *
 * Run seedEraFromIBA from the editor. Depends on nothing else.
 */
var ERA_COL_SEED = COL('Era');      // resolved by header, see Config.gs

var ERA_SEED = {
  "Americano": "Classic",
  "Angel Face": "Classic",
  "Aviation": "Classic",
  "Bees Knees": "Modern Classic",
  "Between the Sheets": "Classic",
  "Bloody Mary": "Classic",
  "Boulevardier": "Classic",
  "Caipirinha": "Classic",
  "Cardinale": "Classic",
  "Chartreuse Swizzle": "Modern Classic",
  "Clover Club": "Classic",
  "Corpse Reviver": "Classic",
  "Cuba Libre": "Classic",
  "Daiquiri": "Classic",
  "Espresso Martini": "Modern Classic",
  "French Connection": "Classic",
  "Garibaldi": "Classic",
  "Hanky Panky": "Classic",
  "Irish Coffee": "Classic",
  "Jungle Bird": "Modern Classic",
  "Last Word": "Classic",
  "Mai Tai": "Classic",
  "Manhattan": "Classic",
  "Margarita": "Classic",
  "Martinez": "Classic",
  "Martini": "Classic",
  "Mary Pickford": "Classic",
  "Mojito": "Classic",
  "Negroni": "Classic",
  "Old Fashioned": "Classic",
  "Paloma": "Modern Classic",
  "Paper Plane": "Modern Classic",
  "Penicillin": "Modern Classic",
  "Pisco Punch": "Modern Classic",
  "Pi\u00f1a Colada": "Classic",
  "Planter's Punch": "Classic",
  "Rusty Nail": "Classic",
  "Sazerac": "Classic",
  "Sherry Cobbler": "Modern Classic",
  "Sidecar": "Classic",
  "Singapore Sling": "Classic",
  "Southside": "Modern Classic",
  "Suffering Bastard": "Modern Classic",
  "The Cosmopolitan": "Classic",
  "The Vesper": "Classic",
  "Three Dots and a Dash": "Modern Classic",
  "Tipperary": "Modern Classic",
  "Tommy's Margarita": "Modern Classic",
  "Trinidad Sour": "Modern Classic",
  "Vieux Carre": "Classic",
  "Whiskey Sour": "Classic",
  "White Lady": "Classic",
  "Zombie": "Classic"
};

function seedEraFromIBA(){
  var ss=SpreadsheetApp.getActive(), cs=ss.getSheetByName('Cocktails');
  var cl=cs.getLastRow();
  var names=cs.getRange(2,COL('Name'),cl-1,1).getValues();
  var era=cs.getRange(2,ERA_COL_SEED,cl-1,1).getValues();
  var filled=0, already=0;
  for(var i=0;i<names.length;i++){
    var nm=names[i][0]; if(!nm) continue; nm=String(nm).trim();
    var tag=ERA_SEED[nm];
    if(!tag) continue;
    if(era[i][0] && String(era[i][0]).trim()!==''){ already++; continue; } // don't overwrite manual
    era[i][0]=tag; filled++;
  }
  if(!cs.getRange(1,ERA_COL_SEED).getValue()) cs.getRange(1,ERA_COL_SEED).setValue('Era').setFontWeight('bold');
  cs.getRange(2,ERA_COL_SEED,era.length,1).setValues(era);
  ss.toast('Seeded Era on '+filled+' drinks ('+already+' already had a value, left as-is).','Cocktail Codex',9);
}