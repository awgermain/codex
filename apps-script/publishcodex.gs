/**
 * Cocktail Codex — Publish data to GitHub  (one-click)
 * ----------------------------------------------------
 * Builds codexdata.js straight from the sheet (same shape the app expects) and
 * pushes it to your GitHub repo via the Contents API. No export/upload dance.
 *
 * v6: publishes the ingredient cell NOTES as a 6th tuple element, so the app can show
 *     which rum a "Rum" actually is. The values stay untouched -- "Rum" is still "Rum"
 *     for My Bar matching, family rules and the Next bottle ranking -- and the detail
 *     surfaces only on the recipe card, where you are actually reading it. Splitting
 *     the taxonomy instead would break exact-string bar matching on every rum drink.
 *
 * v5: also publishes the tab GIDS for Cocktails and RC_TAB. A row number alone is
 *     ambiguous -- row 41 exists on every tab -- so the app needs to know which tab
 *     each row belongs to. Gids are meaningless without the document id, which is
 *     never published and lives only in the owner's browser.
 *
 * v4: publishes ROW NUMBERS so the app can deep-link into the sheet.
 *     `r` on each drink is its row on Cocktails; each ingredient tuple gains a 5th
 *     element, the row on RC_TAB that holds its amount. The app never writes back --
 *     that stands -- but with these it can offer an owner-only link that opens Google
 *     Sheets at the exact cell, which on a phone hands off to the Sheets app. Both
 *     are additive: an older app build ignores them.
 *
 * v3: all columns resolved by HEADER via COL() in Config.gs -- insert or move a
 *     column and this follows. Ingredient columns come from CODEX_ING_GROUPS.
 *     Also publishes `untracked` so the app knows which categories have no
 *     My Bar dot.
 *
 * v2: exports the SOURCE NAME as `sn` alongside the existing `src` URL.
 *     Column Z is rich text — the display text is the creator ("Anders Erickson",
 *     "Make & Drink", "Dad") and the hyperlink behind it is the URL. Until now only
 *     the URL was published, so the app had nothing to credit by name. 692 of 913
 *     links are YouTube, and a YouTube URL contains a video ID rather than a channel
 *     name, so the name genuinely cannot be derived on the client — it has to come
 *     from here. `sn` is the plain text of Z; `src` is unchanged.
 *
 * ── ONE-TIME SETUP ────────────────────────────────────────────────────────
 * 1) Make a fine-grained token: GitHub → Settings → Developer settings →
 *    Personal access tokens → Fine-grained tokens → Generate new token.
 *      • Repository access: Only select repositories → your "codex" repo
 *      • Permissions → Repository permissions → Contents → Read and write
 *      • Set an expiration (you'll regenerate when it lapses)
 *    Copy the token (shown once).
 * 2) In the Apps Script editor: Project Settings (gear) → Script Properties →
 *    Add these properties:
 *      GH_TOKEN  = the token you copied
 *      GH_OWNER  = awgermain
 *      GH_REPO   = codex
 *      GH_BRANCH = main        (optional; defaults to main)
 * 3) Run publishCodexData once from the editor and approve the permission
 *    prompt (it needs to make an external request to github.com).
 *
 * After that: Cocktail Codex → Publish data to GitHub (or run publishCodexData).
 * The live app refreshes about a minute after each push.
 *
 * ── WHEN THE TOKEN EXPIRES ────────────────────────────────────────────────
 * Fine-grained tokens can't live forever (GitHub caps them at 366 days). When
 * yours lapses, publishCodexData just fails with a 401/403 — nothing breaks,
 * no data is lost, the push simply pauses. To fix it (~2 min):
 *   1) GitHub → Settings → Developer settings → Personal access tokens →
 *      Fine-grained tokens → regenerate (same repo "codex", Contents: R/W).
 *   2) Apps Script → Project Settings ⚙ → Script Properties → update GH_TOKEN.
 *   Token expiry set on: ____________   (jot the date when you create it)
 *
 * SECURITY: the token lives in Script Properties, not in this code. Treat it
 * like a password. Scope it to the one repo, with an expiration.
 */

function publishCodexData(){
  var ss=SpreadsheetApp.getActive();
  ss.toast('Building codexdata.js from the sheet…','Cocktail Codex',4);
  var js='window.CODEX_DATA='+JSON.stringify(buildCodexPayload_())+';\n';
  var code=ghPut_('codexdata.js', js, 'Update codexdata.js from sheet ('+new Date().toISOString().slice(0,16).replace('T',' ')+')');
  ss.toast('Pushed codexdata.js to GitHub ('+code+'). Live in ~1 min.','Cocktail Codex',8);
}

/* ---------- build the exact payload the app reads ---------- */
function buildCodexPayload_(){
  var ss=SpreadsheetApp.getActive();
  var cs=ss.getSheetByName('Cocktails');
  var as=ss.getSheetByName(RC_TAB);

  // amount lookup: key -> [amount, unit, rowOnRC]
  // The row number is what lets the app link straight to the cell that holds this
  // amount. i+2 because the values start at row 2 and i is zero-based.
  var AMT={};
  var al=as.getLastRow();
  if(al>=2){
    var av=as.getRange(2,1,al-1,6).getValues(); // A key .. F unit
    for(var i=0;i<av.length;i++){ if(av[i][0]!=='' && av[i][0]!=null){ AMT[String(av[i][0])]=[av[i][4], av[i][5], i+2]; } }
  }

  var cl=cs.getLastRow();

  // ingredient columns come from CODEX_ING_GROUPS in Config.gs, resolved by header.
  // Order in that list controls card order; the physical column can be anywhere.
  // MUST be declared before `wide` is computed below.
  var groups=codexIngCols_();
  var C={md:COL('Made'),ts:COL('TSL'),fv:COL('FAV'),style:COL('Style'),name:COL('Name'),
         base:COL('Spirit Base'),served:COL('Served'),garnish:COL('Garnish/Comments'),
         source:COL('Source'),mood:COL('Mood'),season:COL('Season'),holiday:COL('Holiday'),
         fam:COL('Family'),era:COL('Era')};
  var groupsMax=groups.reduce(function(m,g){return Math.max(m,g.col);},0);
  var wide=Object.keys(C).reduce(function(m,k){return Math.max(m,C[k]);},groupsMax);
  var rows=cs.getRange(2,1,cl-1,wide).getValues();
  /* Cell NOTES on the ingredient columns carry the specificity the values leave out --
     "Plantation 3 Star" on one Rum, "Plantation Stiggins" on the other, "Punt e Mes"
     on a Sweet Vermouth. getNotes() returns notes only, not threaded comments, so
     conversation threads never leak into the payload. */
  var noteVals=cs.getRange(2,1,cl-1,wide).getNotes();
  var srcRich=cs.getRange(2,C.source,cl-1,1).getRichTextValues();

  var SN={fall:'Autumn',autumn:'Autumn',summer:'Summer',winter:'Winter',spring:'Spring'};

  var cocktails=[];
  for(var r=0;r<rows.length;r++){
    var row=rows[r];
    var name=row[C.name-1]; if(!name) continue; name=String(name).trim();
    var seen={}, ings=[];
    for(var g=0;g<groups.length;g++){
      var cat=groups[g].cat;
      var v=row[groups[g].idx]; if(v===''||v==null||String(v).trim()==='') continue;
      var ingn=String(v).trim();
      var occ=(seen[ingn]||0); seen[ingn]=occ+1;
      var key = occ===0 ? name+'|'+ingn : name+'|'+ingn+'|'+(occ+1);
      var a=null,u='',rcRow=null;
      if(AMT[key]){ rcRow=AMT[key][2];
        if(AMT[key][0]!=='' && AMT[key][0]!=null){ a=AMT[key][0]; u=String(AMT[key][1]||''); } }
      /* Tuple is [name, amount, unit, category, rcRow, note]. Positions 5 and 6 are
         optional but POSITIONAL, so rcRow keeps its slot as null whenever a note
         exists without one -- otherwise the note would shift into the row-number
         position and the app would try to link to it. */
      var note=String(noteVals[r][groups[g].idx]||'').trim();
      var tup=[ingn, a, u, cat];
      if(rcRow || note) tup.push(rcRow || null);
      if(note) tup.push(note);
      ings.push(tup);
    }
    // moods (AU=47), season (AV=48, multi, Fall->Autumn), holiday (AW=49)
    var mo=[]; var mv=row[C.mood-1];
    if(mv!==''&&mv!=null){ String(mv).split(',').forEach(function(x){ x=x.trim(); if(x) mo.push(x); }); }
    var se=[]; var sv=row[C.season-1];
    if(sv!==''&&sv!=null){ String(sv).split(',').forEach(function(x){ var k=x.trim().toLowerCase(); if(SN[k]&&se.indexOf(SN[k])<0) se.push(SN[k]); }); }
    // source: `src` is the hyperlink behind column Z, `sn` is Z's visible text.
    // Both are needed — most links are YouTube, whose URLs never contain the creator
    // name, and a few sources (e.g. "Dad") have no URL at all.
    var srcName=String(row[C.source-1]||'').trim();
    cocktails.push({
      n:name, b:String(row[C.base-1]||''), s:String(row[C.style-1]||''),
      g:String(row[C.served-1]||''), ga:String(row[C.garnish-1]||''),
      src:aeSrcUrl_(srcRich[r][0], row[C.source-1], null)||null,
      sn:srcName,
      md:!!row[C.md-1], ts:!!row[C.ts-1], fv:!!row[C.fv-1],
      mo:mo, se:se, ho:String(row[C.holiday-1]||''), i:ings,
      fam:String(row[C.fam-1]||''), era:String(row[C.era-1]||''),
      r:r+2   // this drink's row on Cocktails, for the owner-only edit link

    });
  }

  // have list from MY BAR (rows 3+, cols A..F)
  var have=[]; var seenHave={};
  var mb=ss.getSheetByName('MY BAR');
  if(mb){ var ml=mb.getLastRow();
    if(ml>=3){ var mv2=mb.getRange(3,1,ml-2,6).getValues();
      for(var i2=0;i2<mv2.length;i2++){ for(var c2=0;c2<6;c2++){ var val=mv2[i2][c2];
        if(val!==''&&val!=null){ var s2=String(val).trim(); if(s2&&!seenHave[s2]){ seenHave[s2]=1; have.push(s2); } } } } } }
  have.sort();

  // conversion table: units (row1, cols B..N) + matrix (rows 2..14)
  var ct=ss.getSheetByName('Conversion Table');
  var units=[], conv={};
  if(ct){
    var cvals=ct.getRange(1,1,14,14).getValues();
    for(var u2=1;u2<14;u2++) units.push(cvals[0][u2]);
    for(var rr=1;rr<14;rr++){ var frm=cvals[rr][0]; conv[frm]={};
      for(var ci=0;ci<units.length;ci++){ conv[frm][units[ci]]=cvals[rr][ci+1]; } }
  }

  /* Tab gids, so the app can build a link to the right TAB as well as the right row.
     A gid is a small integer that identifies a tab inside a document -- on its own it
     addresses nothing, so publishing it leaks nothing. The document id stays out of
     here deliberately; it lives only in the owner's browser. */
  return {cocktails:cocktails, have:have, units:units, conv:conv,
          gid:{c:cs.getSheetId(), rc:as.getSheetId()},
          untracked:(typeof CODEX_UNTRACKED_CATS!=='undefined'?CODEX_UNTRACKED_CATS:['Other'])};
}

/* ---------- GitHub Contents API: create/update a file ---------- */
function ghPut_(path, contentStr, message){
  var p=PropertiesService.getScriptProperties();
  var token=p.getProperty('GH_TOKEN'), owner=p.getProperty('GH_OWNER'), repo=p.getProperty('GH_REPO');
  var branch=p.getProperty('GH_BRANCH')||'main';
  if(!token||!owner||!repo) throw new Error('Missing setup: add GH_TOKEN, GH_OWNER, GH_REPO in Project Settings → Script Properties.');
  var api='https://api.github.com/repos/'+owner+'/'+repo+'/contents/'+path;
  var hdr={Authorization:'Bearer '+token, Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28'};

  // current sha (needed to update an existing file)
  var sha=null;
  var getR=UrlFetchApp.fetch(api+'?ref='+encodeURIComponent(branch),{headers:hdr,muteHttpExceptions:true});
  if(getR.getResponseCode()===200){ sha=JSON.parse(getR.getContentText()).sha; }

  var payload={ message:message||('Update '+path),
    content:Utilities.base64Encode(contentStr, Utilities.Charset.UTF_8), branch:branch };
  if(sha) payload.sha=sha;

  var putR=UrlFetchApp.fetch(api,{method:'put',contentType:'application/json',headers:hdr,
    payload:JSON.stringify(payload),muteHttpExceptions:true});
  var code=putR.getResponseCode();
  if(code!==200 && code!==201) throw new Error('GitHub push failed ('+code+'): '+putR.getContentText().slice(0,300));
  return code;
}