/**
 * Cocktail Codex — Amount audit  (v1)
 * -----------------------------------
 * Read-only. Scans RC_TAB for amounts that look wrong and writes a report tab with a
 * clickable link to each offending cell, so you never have to hunt through 3,000 rows.
 *
 * Run auditAmounts from the editor, or the ribbon if you add it to Menu.gs.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHY IT WORKS THE WAY IT DOES
 *
 * 1) THRESHOLDS ARE LEARNED, NOT HARDCODED.
 *    The normal range for a pour is different for a Spirit than for a Sweetener, and
 *    both drift as the collection grows. So each run recomputes the 5th and 95th
 *    percentile per category from your own data and flags anything below 0.6x the
 *    floor or above 1.5x the ceiling. Hardcoded limits would be stale in a month.
 *
 * 2) IT NEVER EDITS ANYTHING.
 *    A report, not a fixer. Every other script in this project that rewrote a column
 *    eventually ate a decision someone made by hand. An auditor that corrects would
 *    be the same mistake with better manners.
 *
 * 3) THERE IS NO "ODD INCREMENT" RULE, DELIBERATELY.
 *    Flagging amounts that are not clean quarter-ounces sounds sensible and is
 *    useless: of 36 such rows, 29 are legitimate thirds (0.667 in an equal-parts Mai
 *    Tai) and the other 7 are eighths (Penicillin's 0.375). A rule that is entirely
 *    false positives trains you to skim the report, which costs you the real hits.
 *
 * 4) DUPLICATES ARE MATCHED ON THE KEY COLUMN.
 *    Not on recipe+ingredient. Listing the same ingredient twice in one drink is
 *    normal -- most split-base rum drinks do it -- and the Key column already carries
 *    an occurrence suffix to tell them apart. Only two rows sharing an identical key
 *    are a real duplicate.
 *
 * 5) AUTO ROWS ARE NOT THE PROBLEM, WHATEVER YOU EXPECT.
 *    Only a handful of the ~98 parser rows flag. The parser only ever wrote a row
 *    when it could extract an amount confidently, and anything it got wrong you
 *    already corrected -- which flipped it to manual. The oddities live in the 3,000
 *    hand-typed rows. The report shows Source so you can see this for yourself.
 * ────────────────────────────────────────────────────────────────────────────
 */

var AUDIT_TAB = 'Audit';
var AUDIT_TAB_OLD = 'Amount Audit';   // renamed in place on first run
/* Everything lives on the one tab, each thing in its own fixed columns so nothing
   shifts when the flag list changes length:
     A-I   flags          K-M  progress        O-P  ignore list (yours, preserved)
     R-S   learned ranges U-W  orphan rows                                        */
var AUDIT_COL_IGNORE = 15;   // O
var AUDIT_COL_RANGES = 18;   // R
var AUDIT_COL_ORPHAN = 21;   // U
var AUDIT_COL_OVERLAP = 25;  // Y
var AUDIT_LOW = 0.6;    // flag below this multiple of the category's 5th percentile
var AUDIT_HIGH = 1.5;   // flag above this multiple of the category's 95th percentile
var AUDIT_MIN_SAMPLE = 20;   // categories with fewer rows than this get no range check
/* Styles that are MEANT to be large. A punch totalling 60 fl oz is a punch; the same
   number on a Sour is a mistake. Checked against the Style column. */
var AUDIT_BIG_STYLES = {'Punch':true};

/** Header -> 1-based column on RC_TAB. Same idea as codexHeaderMap_ in Config.gs,
 *  but that one maps 'Cocktails' only. */
function auditCols_(sh){
  var row = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0], m = {};
  for (var i = 0; i < row.length; i++){
    var h = String(row[i] == null ? '' : row[i]).trim();
    if (h && !m.hasOwnProperty(h)) m[h] = i + 1;
  }
  ['Key','Recipe','Ingredient','Amount','Unit','Category','Source'].forEach(function(k){
    if (!m.hasOwnProperty(k)) throw new Error("Audit: column '" + k + "' not found in " + RC_TAB
      + '. Found: ' + Object.keys(m).join(' | '));
  });
  return m;
}

function auditPct_(arr, p){
  if (!arr.length) return null;
  var a = arr.slice().sort(function(x, y){ return x - y; });
  var i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (i - lo);
}

function auditAmounts(){
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(RC_TAB);
  if (!sh) throw new Error('Audit: tab ' + RC_TAB + ' not found.');
  var C = auditCols_(sh);
  var last = sh.getLastRow();
  if (last < 2){ ss.toast('Nothing to audit.', 'Cocktail Codex', 5); return; }

  var wide = Math.max(C.Key, C.Recipe, C.Ingredient, C.Amount, C.Unit, C.Category, C.Source);
  var vals = sh.getRange(2, 1, last - 1, wide).getValues();

  // ---- pass 1: learn what normal looks like, per category, from fl oz rows
  var byCat = {}, seen = {};
  for (var i = 0; i < vals.length; i++){
    var v = vals[i];
    if (!v[C.Recipe - 1]) continue;
    var unit = String(v[C.Unit - 1] || '').trim();
    var amt  = v[C.Amount - 1];
    var cat  = String(v[C.Category - 1] || '').trim() || '(none)';
    if (unit === 'fl oz' && typeof amt === 'number' && amt > 0){
      (byCat[cat] = byCat[cat] || []).push(amt);
    }
  }
  var range = {};
  for (var c in byCat){
    if (byCat[c].length < AUDIT_MIN_SAMPLE) continue;
    range[c] = { lo: auditPct_(byCat[c], 0.05), hi: auditPct_(byCat[c], 0.95),
                 med: auditPct_(byCat[c], 0.5), n: byCat[c].length };
  }

  /* Cocktails is read once, here, because three things downstream need it: the recipe
     totals, the orphan check and the dashboard. It used to be read inside the dashboard
     block, which sits after the totals that depend on it. */
  var cs=ss.getSheetByName('Cocktails');
  var chl=cs.getLastRow(), chdr=cs.getRange(1,1,1,cs.getLastColumn()).getValues()[0];
  var cmap={}; for (var q=0;q<chdr.length;q++){ var hh=String(chdr[q]||'').trim(); if(hh) cmap[hh]=q; }
  var ingCols=(typeof codexIngCols_==='function')?codexIngCols_():[];
  var cvals=cs.getRange(2,1,chl-1,cs.getLastColumn()).getValues();

  /* ---- things you have already looked at ----
     A flag you have checked and accepted should stop appearing, or the report stops
     being a worklist and becomes a list you learn to skim. Put a Key (or a bare recipe
     name, to silence its whole-recipe flag) in the Audit Ignore tab and it is skipped
     from here on. The tab is created on first run. */
  /* Read BEFORE the tab is cleared, and written back afterwards -- it is the only
     thing here you author rather than the script, so it has to survive the rebuild. */
  var ign={}, ignRows=[];
  var tPre = ss.getSheetByName(AUDIT_TAB) || ss.getSheetByName(AUDIT_TAB_OLD);
  if(tPre && tPre.getLastRow()>1){
    var ivr=tPre.getLastRow()-1;
    var iv=tPre.getRange(2,AUDIT_COL_IGNORE,ivr,2).getValues();
    for (var ii=0; ii<iv.length; ii++){
      var ik=String(iv[ii][0]||'').trim();
      if(ik){ ign[ik.toLowerCase()]=1; ignRows.push([ik, iv[ii][1]||'']); }
    }
  }

  // ---- pass 2: flag
  var url = ss.getUrl(), gid = sh.getSheetId();
  var out = [], counts = {};
  function note(k){ counts[k] = (counts[k] || 0) + 1; }

  for (var r = 0; r < vals.length; r++){
    var row = vals[r], rowNum = r + 2;
    var rec = String(row[C.Recipe - 1] || '').trim();
    if (!rec) continue;
    var ing  = String(row[C.Ingredient - 1] || '').trim();
    var unit = String(row[C.Unit - 1] || '').trim();
    var cat  = String(row[C.Category - 1] || '').trim() || '(none)';
    var src  = String(row[C.Source - 1] || '').trim();
    var amt  = row[C.Amount - 1];
    var flag = '', sev = 0;

    /* Key on the KEY COLUMN, not recipe+ingredient. A drink can legitimately list the
       same ingredient twice -- 59 of your rum drinks split the base across two rums --
       and the sheet already distinguishes those with an occurrence suffix
       ("Drink|Rum" vs "Drink|Rum|2"). Matching on recipe+ingredient flagged all 63 of
       those as duplicates, which is what buried the real hits. */
    var key = String(row[C.Key - 1] || '').trim().toLowerCase()
              || (rec.toLowerCase() + '|' + ing.toLowerCase() + '|r' + rowNum);
    if (seen[key]) { flag = 'duplicate key, same as row ' + seen[key]; sev = 5; }
    else seen[key] = rowNum;

    if (!flag && (amt === '' || amt == null)){ flag = 'no amount'; sev = 6; }
    else if (!flag && typeof amt === 'number' && amt <= 0){ flag = 'amount is zero or negative'; sev = 6; }
    else if (!flag && unit === 'fl oz' && typeof amt === 'number' && range[cat]){
      var R = range[cat];
      if (amt < R.lo * AUDIT_LOW){
        flag = 'low for ' + cat + ' (normal ' + auditFmt_(R.lo) + '\u2013' + auditFmt_(R.hi) + ')';
        sev = R.lo * AUDIT_LOW / amt;
      } else if (amt > R.hi * AUDIT_HIGH){
        flag = 'high for ' + cat + ' (normal ' + auditFmt_(R.lo) + '\u2013' + auditFmt_(R.hi) + ')';
        sev = amt / (R.hi * AUDIT_HIGH);
      }
    }
    if (!flag) continue;
    if (ign[key] || ign[rec.toLowerCase()]) continue;      // reviewed and accepted
    note(flag.split(' (')[0]);
    var cellA1 = auditA1_(C.Amount) + rowNum;
    out.push([
      Math.round(sev * 100) / 100, flag, rec, ing,
      (amt === '' || amt == null) ? '' : amt, unit, cat, src,
      '=HYPERLINK("' + url + '#gid=' + gid + '&range=' + cellA1 + '","' + cellA1 + ' \u2197")'
    ]);
  }

  /* ---- composition overlap ----
     Drinks whose tracked ingredient set is IDENTICAL. Not errors -- Martini and The
     Gibson differ only by garnish, Manhattan and Reverse Manhattan only by proportion
     -- but worth seeing, because a genuine accidental duplicate looks exactly the same
     from here. Computed every run rather than kept as a snapshot: the list was 9
     groups when it was last pasted somewhere and is 10 now. */
  var sets={};
  for (var ov=0; ov<cvals.length; ov++){
    var onm=String(cvals[ov][cmap['Name']]||'').trim(); if(!onm) continue;
    var parts=[];
    for (var og=0; og<ingCols.length; og++){
      var oiv=cvals[ov][ingCols[og].idx];
      if(oiv!==''&&oiv!=null&&String(oiv).trim()!=='') parts.push(String(oiv).trim());
    }
    if(!parts.length) continue;
    var skey=parts.slice().sort().join(' | ');
    (sets[skey]=sets[skey]||[]).push(onm);
  }
  var ngroups=0;
  for (var sk0 in sets) if(sets[sk0].length>1) ngroups++;

  /* ---- recipe totals ----
     A per-ROW check cannot see a recipe that is wrong as a whole. Sweet Gin Music is
     2 + 5 + 2 + 2 fl oz with no spirit: only the 5 trips an ingredient ceiling, while
     the drink itself is plainly mis-scaled at 11 fl oz. Totals catch that. Punch is
     exempted by Style, because 60 fl oz is what a punch IS. */
  var styleOf={};
  for (var sy=0; sy<cvals.length; sy++){
    var sn=String(cvals[sy][cmap['Name']]||'').trim();
    if(sn && cmap.hasOwnProperty('Style')) styleOf[sn]=String(cvals[sy][cmap['Style']]||'').trim();
  }
  var recTot={};
  for (var rt=0; rt<vals.length; rt++){
    if(String(vals[rt][C.Unit-1]||'').trim()!=='fl oz') continue;
    var rn=String(vals[rt][C.Recipe-1]||'').trim(), ra=vals[rt][C.Amount-1];
    if(rn && typeof ra==='number') recTot[rn]=(recTot[rn]||0)+ra;
  }
  var normals=[];
  for (var rk in recTot) if(!AUDIT_BIG_STYLES[styleOf[rk]] && recTot[rk]>0) normals.push(recTot[rk]);
  if(normals.length>=40){
    var tLo=auditPct_(normals,0.05)*0.6, tHi=auditPct_(normals,0.95)*1.6;
    for (var rk2 in recTot){
      if(AUDIT_BIG_STYLES[styleOf[rk2]]) continue;
      if(ign[rk2.toLowerCase()]) continue;
      var tv=recTot[rk2]; if(!tv) continue;
      if(tv>tHi || tv<tLo){
        note('recipe total');
        out.push([Math.round((tv>tHi?tv/tHi:tLo/tv)*100)/100,
          'recipe total ' + auditFmt_(tv) + ' fl oz (normal ' + auditFmt_(tLo) + '\u2013' + auditFmt_(tHi) + ')',
          rk2, '\u2014 whole recipe \u2014', tv, 'fl oz', styleOf[rk2]||'', '', '']);
      }
    }
  }

  out.sort(function(a, b){ return b[0] - a[0]; });

  // ---- write the report
  var t = ss.getSheetByName(AUDIT_TAB);
  if(!t){
    var oldT = ss.getSheetByName(AUDIT_TAB_OLD);
    if(oldT){ oldT.setName(AUDIT_TAB); t=oldT; } else { t=ss.insertSheet(AUDIT_TAB); }
  }
  /* clearContents, not clear: clear() wipes formatting too, which is why the font kept
     reverting every run. Contents go, formatting stays. */
  t.clearContents();
  /* Flag table stays at row 1 where it has always been. An earlier version pushed it
     to row 15 to make room for the dashboard above it, which broke the frozen row and
     any filter set on the tab -- the numbers are worth having, not worth moving the
     table everyone reads. They go in columns K and L instead. */
  var HEADROW = 1;
  var head = ['Severity','Flag','Recipe','Ingredient','Amount','Unit','Category','Source','Go to cell'];
  t.getRange(HEADROW, 1, 1, head.length).setValues([head]).setFontWeight('bold');
  t.setFrozenRows(1);
  if (out.length) t.getRange(HEADROW+1, 1, out.length, head.length).setValues(out);
  [70, 260, 200, 190, 70, 70, 100, 80, 110].forEach(function(w, i){ t.setColumnWidth(i + 1, w); });

  /* ---- progress dashboard, above the flags ----
     Put where you already look. The figures that move as you work: how much of the
     backlog is left, how many recipes are complete, and how far each tag column has
     got. Read-only like the rest of this script. */
  var amounted={};
  for (var z=0;z<vals.length;z++){ var kk=String(vals[z][C.Key-1]||'').trim();
    if(kk && vals[z][C.Amount-1]!=='' && vals[z][C.Amount-1]!=null) amounted[kk]=1; }
  var drinks=0, needSlots=0, doneDrinks=0;
  for (var d2=0; d2<cvals.length; d2++){
    var nm=String(cvals[d2][cmap['Name']]||'').trim(); if(!nm) continue;
    drinks++;
    var seen2={}, gaps=0;
    for (var g2=0; g2<ingCols.length; g2++){
      var iv=cvals[d2][ingCols[g2].idx]; if(iv===''||iv==null||String(iv).trim()==='') continue;
      iv=String(iv).trim();
      var occ2=(seen2[iv]||0)+1; seen2[iv]=occ2;
      var k2 = occ2===1 ? nm+'|'+iv : nm+'|'+iv+'|'+occ2;
      if(!amounted[k2]) gaps++;
    }
    needSlots+=gaps; if(!gaps) doneDrinks++;
  }
  /* ORPHANS. PublishCodex builds each lookup key as Name|Ingredient from the Cocktails
     row, then reads the amount out of RC_TAB by that key. If the key stored in RC_TAB
     does not match -- a renamed drink, a retyped ingredient, a stray space, a lost
     occurrence suffix -- the lookup returns nothing and the amount publishes as null.
     Nothing errors; the recipe just shows no amounts. That is invisible unless you go
     looking, so it gets looked for here.
       orphan rows : a key in RC_TAB that no current ingredient cell produces
       unmatched   : an ingredient cell whose key has no row in RC_TAB */
  var liveKeys={};
  for (var d3=0; d3<cvals.length; d3++){
    var nm3=String(cvals[d3][cmap['Name']]||'').trim(); if(!nm3) continue;
    var seen3={};
    for (var g3=0; g3<ingCols.length; g3++){
      var iv3=cvals[d3][ingCols[g3].idx]; if(iv3===''||iv3==null||String(iv3).trim()==='') continue;
      iv3=String(iv3).trim();
      var o3=(seen3[iv3]||0)+1; seen3[iv3]=o3;
      liveKeys[o3===1 ? nm3+'|'+iv3 : nm3+'|'+iv3+'|'+o3]=1;
    }
  }
  /* Two normalisations, so an orphan can be told from a typo.
       loose  — first line only, trimmed, whitespace collapsed. Catches a name cell that
                got a whole recipe pasted into it, and every trailing space.
       tight  — loose, lowercased, stripped to letters and digits. Catches Passionfruit
                vs Passion Fruit, Peychauds vs Peychaud's, Eau-de-vie vs Eau de vie.
     Anything neither reaches is not a typo -- it is an amount left behind by a real
     edit, and wants deleting rather than repairing. */
  function nLoose(k){ var p=k.indexOf('|'); if(p<0) return k.trim();
    return k.slice(0,p).split('\n')[0].replace(/\s+/g,' ').trim()+'|'+k.slice(p+1).replace(/\s+/g,' ').trim(); }
  function nTight(k){ return nLoose(k).toLowerCase().replace(/[^a-z0-9|]/g,''); }
  var byLoose={}, byTight={};
  for (var lk in liveKeys){ byLoose[nLoose(lk)]=lk; byTight[nTight(lk)]=lk; }
  /* Third tier: containment. An ingredient renamed from "Bitters" to "Angostura
     Bitters" leaves a key that no amount of normalising will match, but the drink has
     exactly one live ingredient whose name contains the old one. Only suggested when
     there is EXACTLY one such candidate -- two would be a guess. Lower confidence than
     the first two tiers, so it is labelled differently and never auto-applied: a
     compound cell that got split (Cucumber, Mint, & Egg White -> three ingredients)
     will match one of its pieces and putting the combined amount there would be wrong. */
  var byRec={};
  for (var lk2 in liveKeys){
    var p2=lk2.indexOf('|'); if(p2<0) continue;
    var rc2=lk2.slice(0,p2), in2=lk2.slice(p2+1).replace(/\|\d+$/,'');
    (byRec[rc2]=byRec[rc2]||[]).push([in2, lk2]);
  }
  var filled={};
  for (var z3=0; z3<vals.length; z3++){
    var kf=String(vals[z3][C.Key-1]||'').trim();
    if(kf && vals[z3][C.Amount-1]!=='' && vals[z3][C.Amount-1]!=null) filled[kf]=1;
  }
  var orphans=[];
  for (var z2=0; z2<vals.length; z2++){
    var k3=String(vals[z2][C.Key-1]||'').trim();
    if(!k3 || liveKeys[k3]) continue;
    var sug='', how='';
    if(byLoose[nLoose(k3)]){ sug=byLoose[nLoose(k3)]; how='rename \u2014 whitespace or paste'; }
    else if(byTight[nTight(k3)]){ sug=byTight[nTight(k3)]; how='rename \u2014 spelling'; }
    else {
      var p3=k3.indexOf('|');
      var rc3=(p3<0?k3:k3.slice(0,p3)).split('\n')[0].trim();
      var in3=(p3<0?'':k3.slice(p3+1).replace(/\|\d+$/,'')).toLowerCase().trim();
      var cands=[], lst=byRec[rc3]||[];
      for (var ci=0; ci<lst.length; ci++){
        var nmc=lst[ci][0].toLowerCase();
        if(nmc===in3) continue;
        if(in3 && (nmc.indexOf(in3)>=0 || in3.indexOf(nmc)>=0)) cands.push(lst[ci][1]);
      }
      if(cands.length===1){ sug=cands[0]; how='likely rename \u2014 CHECK'; }
    }
    if(sug && filled[sug]) how += ' (target already has an amount)';
    orphans.push([k3, z2+2, sug, how]);
  }
  function pctOf(col){
    if(!cmap.hasOwnProperty(col)) return '-';
    var n=0; for (var y=0;y<cvals.length;y++){ if(String(cvals[y][cmap['Name']]||'').trim() && String(cvals[y][cmap[col]]||'').trim()) n++; }
    return n+' / '+drinks+'  ('+Math.round(n/drinks*100)+'%)';
  }
  /* Every column needs a non-empty header for these to work as Google Tables, and no
     blank rows inside the block -- a table treats them as empty records. The spacers
     and the PROGRESS/FLAGS BELOW title rows are gone; the headers do that job now. */
  var dash=[
    ['Metric','Value'],
    ['Recipes', drinks],
    ['Recipes with every amount filled', doneDrinks+' / '+drinks+'  ('+Math.round(doneDrinks/drinks*100)+'%)'],
    ['Ingredient amounts still missing', needSlots],
    ['Amount rows on '+RC_TAB, vals.length],
    ['Rows flagged below', out.length+' / '+vals.length],
    ['Orphan amount rows', orphans.length],
    ['Identical ingredient sets', ngroups],
    ['Mood tagged', pctOf('Mood')],
    ['Season tagged', pctOf('Season')],
    ['Family tagged', pctOf('Family')],
    ['Era tagged', pctOf('Era')],
    ['Holiday tagged', pctOf('Holiday')]
  ];
  t.getRange(1,11,dash.length,2).setValues(dash);
  t.getRange(1,11,1,3).setFontWeight('bold');
  /* Colour is the reason to use a real SPARKLINE rather than a REPT bar: a bar of
     characters is one colour, the whole cell's. The chart gets its own, banded the same
     way as everything else -- green from 67%, amber from 34%, red below. It has to own
     a cell, so it sits in M rather than beside the figures. */
  var spark=[['Progress']];
  for (var sp=1; sp<dash.length; sp++){
    var m3=String(dash[sp][1]).match(/\((\d+)%\)/);
    if(!m3){ spark.push(['']); continue; }
    var pc=parseInt(m3[1],10);
    spark.push(['=SPARKLINE('+(pc/100)+',{"charttype","bar";"max",1;"color1","'
      +(pc>=67?'#6aa84f':(pc>=34?'#bf9000':'#a61c00'))+'"})']);
  }
  t.getRange(1,13,spark.length,1).setFormulas(spark);
  t.setColumnWidth(11,230); t.setColumnWidth(12,170); t.setColumnWidth(13,110);
  /* Applied every run so new rows match the rest rather than inheriting the default. */
  t.getRange(1,1,Math.max(t.getLastRow(),1),27).setFontFamily('Calibri').setFontSize(12).setFontStyle('italic');
  t.getRange(HEADROW,1,1,head.length).setFontWeight('bold');
  t.getRange(1,11).setFontWeight('bold');

  /* Each block gets its own columns, so none of them move when another changes length.
     Ignore is written back from what was read before the clear. */
  var rr=[['Category','Learned range (fl oz, from your data)']];
  for (var cc in range) rr.push([cc, 'n=' + range[cc].n + '  median ' + auditFmt_(range[cc].med)
    + '  normal ' + auditFmt_(range[cc].lo) + '\u2013' + auditFmt_(range[cc].hi)
    + '  flags <' + auditFmt_(range[cc].lo * AUDIT_LOW) + ' or >' + auditFmt_(range[cc].hi * AUDIT_HIGH)]);
  t.getRange(1, AUDIT_COL_RANGES, rr.length, 2).setValues(rr);
  t.getRange(1, AUDIT_COL_RANGES, 1, 2).setFontWeight('bold');
  t.setColumnWidth(AUDIT_COL_RANGES,130); t.setColumnWidth(AUDIT_COL_RANGES+1,330);

  var oo=[['Orphan key in '+RC_TAB,'Suggested key, or action','Go to row']];
  for (var o4=0; o4<Math.min(orphans.length,120); o4++){
    var ok4=orphans[o4][0].split('\n')[0];
    if(orphans[o4][0].indexOf('\n')>=0) ok4+=' \u2026';
    oo.push([ok4,
             orphans[o4][2] ? (orphans[o4][2]+'   ['+orphans[o4][3]+']')
                            : 'DELETE \u2014 no matching ingredient cell',
             '=HYPERLINK("'+url+'#gid='+gid+'&range=A'+orphans[o4][1]+'","row '+orphans[o4][1]+' \u2197")']);
  }
  if(orphans.length>120) oo.push(['... and '+(orphans.length-120)+' more','','']);
  t.getRange(1, AUDIT_COL_ORPHAN, oo.length, 3).setValues(oo);
  t.getRange(1, AUDIT_COL_ORPHAN, 1, 3).setFontWeight('bold');
  t.setColumnWidth(AUDIT_COL_ORPHAN,300); t.setColumnWidth(AUDIT_COL_ORPHAN+1,330); t.setColumnWidth(AUDIT_COL_ORPHAN+2,95);

  var ovr=[['Identical ingredient sets','Detail']];
  for (var sk in sets){
    if(sets[sk].length<2) continue;
    ovr.push([sets[sk].sort().join('  /  '), sets[sk].length+' drinks, '+sk.split(' | ').length+' ingredients']);
  }
  if(ngroups===0) ovr.push(['none','\u2014']);
  t.getRange(1, AUDIT_COL_OVERLAP, ovr.length, 2).setValues(ovr);
  t.getRange(1, AUDIT_COL_OVERLAP, 1, 2).setFontWeight('bold');
  t.setColumnWidth(AUDIT_COL_OVERLAP,360); t.setColumnWidth(AUDIT_COL_OVERLAP+1,220);

  var ig=[['Ignore (key or recipe)','Why it is fine']];
  for (var ig2=0; ig2<ignRows.length; ig2++) ig.push(ignRows[ig2]);
  t.getRange(1, AUDIT_COL_IGNORE, ig.length, 2).setValues(ig);
  t.getRange(1, AUDIT_COL_IGNORE, 1, 2).setFontWeight('bold');
  t.setColumnWidth(AUDIT_COL_IGNORE,300); t.setColumnWidth(AUDIT_COL_IGNORE+1,260);

  var parts = [];
  for (var k in counts) parts.push(k + ' ' + counts[k]);
  var msg = out.length + ' flagged of ' + vals.length + ' rows  (' + parts.sort().join(', ') + ')';
  ss.toast(msg, 'Cocktail Codex \u2014 Amount audit', 12);
  Logger.log(msg + '\nReport written to "' + AUDIT_TAB + '". Nothing was changed.');
}

function auditFmt_(n){ return (Math.round(n * 100) / 100).toString(); }

/** 1-based column index -> A1 letter. */
function auditA1_(col){
  var s = '';
  while (col > 0){ var m = (col - 1) % 26; s = String.fromCharCode(65 + m) + s; col = (col - m - 1) / 26; }
  return s;
}


/* ---------------------------------------------------------------------------
 * Highlighting the orphan rows in place.
 *
 * Deliberately NOT part of auditAmounts. That function reads and reports and has
 * never written to a data sheet, and keeping it that way is worth more than the
 * convenience of doing this automatically. This is a separate, named action you
 * choose to run, and clearOrphanHighlights undoes it completely.
 * ------------------------------------------------------------------------- */
var ORPHAN_COLOR = '#f4cccc';

function highlightOrphans(){
  var ss=SpreadsheetApp.getActive(), sh=ss.getSheetByName(RC_TAB);
  if(!sh) throw new Error('Highlight: tab '+RC_TAB+' not found.');
  var C=auditCols_(sh), last=sh.getLastRow();
  if(last<2){ ss.toast('Nothing to check.','Cocktail Codex',5); return; }
  var cs=ss.getSheetByName('Cocktails');
  var chdr=cs.getRange(1,1,1,cs.getLastColumn()).getValues()[0], cmap={};
  for (var q=0;q<chdr.length;q++){ var hh=String(chdr[q]||'').trim(); if(hh) cmap[hh]=q; }
  var ing=codexIngCols_();
  var cvals=cs.getRange(2,1,cs.getLastRow()-1,cs.getLastColumn()).getValues();
  var live={};
  for (var d=0; d<cvals.length; d++){
    var nm=String(cvals[d][cmap['Name']]||'').trim(); if(!nm) continue;
    var seen={};
    for (var g=0; g<ing.length; g++){
      var iv=cvals[d][ing[g].idx]; if(iv===''||iv==null||String(iv).trim()==='') continue;
      iv=String(iv).trim();
      var o=(seen[iv]||0)+1; seen[iv]=o;
      live[o===1 ? nm+'|'+iv : nm+'|'+iv+'|'+o]=1;
    }
  }
  var keys=sh.getRange(2,C.Key,last-1,1).getValues();
  var wide=sh.getLastColumn();
  // one getRange per row would be hundreds of calls; build the whole colour grid instead
  var colors=[], n=0;
  for (var r=0; r<keys.length; r++){
    var k=String(keys[r][0]||'').trim();
    var bad = k && !live[k];
    if(bad) n++;
    var row=[]; for (var c=0;c<wide;c++) row.push(bad?ORPHAN_COLOR:null);
    colors.push(row);
  }
  sh.getRange(2,1,keys.length,wide).setBackgrounds(colors);
  ss.toast(n+' orphan row(s) highlighted in '+RC_TAB+'. Run Clear Orphan Highlights to undo.','Cocktail Codex',10);
}

function clearOrphanHighlights(){
  var ss=SpreadsheetApp.getActive(), sh=ss.getSheetByName(RC_TAB);
  if(!sh) return;
  var last=sh.getLastRow(); if(last<2) return;
  sh.getRange(2,1,last-1,sh.getLastColumn()).setBackground(null);
  ss.toast('Highlights cleared.','Cocktail Codex',5);
}


/* ---------------------------------------------------------------------------
 * repairOrphans — rewrites the keys that are unambiguously wrong.
 *
 * Touches ONLY the two high-confidence tiers: a key that matches a live ingredient
 * once whitespace is normalised, or once spelling is normalised. It will not touch
 * a "likely rename — CHECK" row, because those come from containment matching and a
 * split compound cell can match one of its own pieces. It will not touch a DELETE
 * row, because deleting data is yours to do. And it skips anything whose target
 * already has an amount, which would create a duplicate.
 *
 * Asks before it writes, and says exactly how many rows it will change.
 * ------------------------------------------------------------------------- */
function repairOrphans(){
  var ss=SpreadsheetApp.getActive(), ui=SpreadsheetApp.getUi();
  var sh=ss.getSheetByName(RC_TAB); if(!sh) throw new Error('Repair: '+RC_TAB+' not found.');
  var C=auditCols_(sh), last=sh.getLastRow();
  if(last<2){ ss.toast('Nothing to repair.','Cocktail Codex',5); return; }

  var cs=ss.getSheetByName('Cocktails');
  var chdr=cs.getRange(1,1,1,cs.getLastColumn()).getValues()[0], cmap={};
  for (var q=0;q<chdr.length;q++){ var hh=String(chdr[q]||'').trim(); if(hh) cmap[hh]=q; }
  var ing=codexIngCols_();
  var cvals=cs.getRange(2,1,cs.getLastRow()-1,cs.getLastColumn()).getValues();
  var liveKeys={};
  for (var d=0; d<cvals.length; d++){
    var nm=String(cvals[d][cmap['Name']]||'').trim(); if(!nm) continue;
    var seen={};
    for (var g=0; g<ing.length; g++){
      var iv=cvals[d][ing[g].idx]; if(iv===''||iv==null||String(iv).trim()==='') continue;
      iv=String(iv).trim();
      var o=(seen[iv]||0)+1; seen[iv]=o;
      liveKeys[o===1 ? nm+'|'+iv : nm+'|'+iv+'|'+o]=1;
    }
  }
  function nLoose(k){ var p=k.indexOf('|'); if(p<0) return k.trim();
    return k.slice(0,p).split('\n')[0].replace(/\s+/g,' ').trim()+'|'+k.slice(p+1).replace(/\s+/g,' ').trim(); }
  function nTight(k){ return nLoose(k).toLowerCase().replace(/[^a-z0-9|]/g,''); }
  var byLoose={}, byTight={};
  for (var lk in liveKeys){ byLoose[nLoose(lk)]=lk; byTight[nTight(lk)]=lk; }

  var wide=Math.max(C.Key,C.Recipe,C.Ingredient,C.Amount);
  var vals=sh.getRange(2,1,last-1,wide).getValues();
  var filled={};
  for (var z=0; z<vals.length; z++){
    var kf=String(vals[z][C.Key-1]||'').trim();
    if(kf && vals[z][C.Amount-1]!=='' && vals[z][C.Amount-1]!=null) filled[kf]=1;
  }

  var jobs=[];
  for (var r=0; r<vals.length; r++){
    var k=String(vals[r][C.Key-1]||'').trim();
    if(!k || liveKeys[k]) continue;
    var sug = byLoose[nLoose(k)] || byTight[nTight(k)] || '';
    if(!sug || filled[sug]) continue;            // CHECK/DELETE tiers and duplicates skipped
    jobs.push([r+2, k, sug]);
  }
  if(!jobs.length){ ui.alert('Repair orphans','Nothing to repair. Every remaining orphan needs a human decision.',ui.ButtonSet.OK); return; }

  var preview=jobs.slice(0,6).map(function(j){
    return '  row '+j[0]+':  '+j[1].split('\n')[0].slice(0,40)+(j[1].indexOf('\n')>=0?' …':'')+'\n        -> '+j[2];
  }).join('\n');
  var ans=ui.alert('Repair orphans',
    jobs.length+' row(s) will have their Key, Recipe and Ingredient rewritten.\n\n'+preview+
    (jobs.length>6 ? '\n  … and '+(jobs.length-6)+' more' : '')+
    '\n\nAmounts and units are not touched. Rows needing a decision are left alone.\n\nProceed?',
    ui.ButtonSet.YES_NO);
  if(ans!==ui.Button.YES){ ss.toast('Nothing changed.','Cocktail Codex',5); return; }

  for (var j2=0; j2<jobs.length; j2++){
    var row=jobs[j2][0], key=jobs[j2][2];
    var p=key.indexOf('|');
    var rec=key.slice(0,p), rest=key.slice(p+1);
    var occ=rest.match(/\|(\d+)$/);
    var ingName = occ ? rest.slice(0, rest.length-occ[0].length) : rest;
    sh.getRange(row, C.Key).setValue(key);
    sh.getRange(row, C.Recipe).setValue(rec);
    sh.getRange(row, C.Ingredient).setValue(ingName);
  }
  ss.toast('Repaired '+jobs.length+' key(s). Run Audit Amounts again, then publish.','Cocktail Codex',10);
  Logger.log('repairOrphans rewrote '+jobs.length+' rows:\n'+jobs.map(function(j){return '  '+j[0]+'  '+j[1]+'  ->  '+j[2];}).join('\n'));
}