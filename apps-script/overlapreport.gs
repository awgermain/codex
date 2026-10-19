/**
 * Cocktail Codex — Composition Overlap Report
 * -------------------------------------------
 * Finds drinks that share the same or nearly-the-same ingredient set (regardless
 * of name or proportions), and writes the results to a tab called "Overlap Report".
 *   • EXACT: identical ingredient sets (true dupes or proportion-only variants)
 *   • NEAR : share most ingredients (Jaccard >= threshold), differ by ~1 item
 *
 * This complements your name-based duplicate check — it catches drinks that ARE
 * the same build under different names, and surfaces riffs (Mai Tai ~ Bitter Mai
 * Tai). Read-only: it never edits your Cocktails data, just writes the report tab.
 *
 * Run overlapReport from the editor. Re-runnable (rebuilds the report tab).
 */
var OVL_TAB='Overlap Report';
var OVL_JACCARD=0.72;   // near-match threshold
var OVL_MIN_SHARED=3;   // require at least this many shared ingredients for a near-match

function overlapReport(){
  var ss=SpreadsheetApp.getActive(), cs=ss.getSheetByName('Cocktails');
  var cl=cs.getLastRow();
  var OV_NAME=COL('Name'), OV_ING=codexIngCols_();      // by header, see Config.gs
  var ovWide=OV_ING.reduce(function(m,g){return Math.max(m,g.col);}, OV_NAME);
  var grid=cs.getRange(2,1,cl-1,ovWide).getValues();
  var drinks=[]; // {name, set:{ing:true}, key:sortedString}
  for(var r=0;r<grid.length;r++){
    var name=grid[r][OV_NAME-1]; if(!name) continue;
    var set={}, arr=[];
    for(var c=0;c<OV_ING.length;c++){ var v=grid[r][OV_ING[c].idx]; if(v===''||v==null||String(v).trim()==='') continue;
      var ing=String(v).toLowerCase().replace(/\s+/g,' ').trim(); if(!set[ing]){ set[ing]=true; arr.push(ing); } }
    if(arr.length){ arr.sort(); drinks.push({name:String(name).trim(), set:set, arr:arr, key:arr.join(' + ')}); }
  }

  // EXACT groups by identical key
  var byKey={};
  for(var i=0;i<drinks.length;i++){ (byKey[drinks[i].key]=byKey[drinks[i].key]||[]).push(drinks[i].name); }
  var exact=[]; for(var k in byKey){ if(byKey[k].length>1) exact.push([byKey[k].sort().join('  |  '), k]); }

  // NEAR via inverted index (only compare drinks that share an ingredient)
  var inv={}; // ingredient -> [indices]
  for(var i=0;i<drinks.length;i++) for(var a=0;a<drinks[i].arr.length;a++){ var ing=drinks[i].arr[a]; (inv[ing]=inv[ing]||[]).push(i); }
  var seenPair={}, near=[];
  for(var i=0;i<drinks.length;i++){
    var cand={};
    for(var a=0;a<drinks[i].arr.length;a++){ var lst=inv[drinks[i].arr[a]]; for(var b=0;b<lst.length;b++){ var j=lst[b]; if(j>i) cand[j]=true; } }
    for(var j in cand){ j=+j;
      var s1=drinks[i], s2=drinks[j];
      if(s1.key===s2.key) continue; // exact handled above
      var inter=0; for(var a=0;a<s1.arr.length;a++) if(s2.set[s1.arr[a]]) inter++;
      if(inter<OVL_MIN_SHARED) continue;
      var uni=s1.arr.length+s2.arr.length-inter; var jac=inter/uni;
      if(jac>=OVL_JACCARD){
        // symmetric difference for the "differs by" note
        var diff=[]; for(var a=0;a<s1.arr.length;a++) if(!s2.set[s1.arr[a]]) diff.push(s1.arr[a]);
        for(var a=0;a<s2.arr.length;a++) if(!s1.set[s2.arr[a]]) diff.push(s2.arr[a]);
        near.push([Math.round(jac*100)/100, s1.name, s2.name, diff.join(', ')]);
      }
    }
  }
  near.sort(function(a,b){ return b[0]-a[0]; });

  // write report tab
  var sh=ss.getSheetByName(OVL_TAB); if(sh) sh.clear(); else sh=ss.insertSheet(OVL_TAB);
  var out=[['EXACT COMPOSITION MATCHES','','']];
  out.push(['Drinks (identical ingredient set)','Ingredients','']);
  exact.sort();
  for(var e=0;e<exact.length;e++) out.push([exact[e][0], exact[e][1], '']);
  out.push(['','','']);
  out.push(['NEAR MATCHES (Jaccard >= '+OVL_JACCARD+')','','']);
  out.push(['Similarity','Drink A  ~  Drink B','Differs by']);
  for(var m=0;m<near.length;m++) out.push([near[m][0], near[m][1]+'  ~  '+near[m][2], near[m][3]]);

  sh.getRange(1,1,out.length,3).setValues(out);
  sh.setColumnWidth(1,240); sh.setColumnWidth(2,420); sh.setColumnWidth(3,320);
  sh.getRange(1,1).setFontWeight('bold'); sh.getRange(exact.length+4,1).setFontWeight('bold');
  ss.toast('Overlap report: '+exact.length+' exact groups, '+near.length+' near-matches. See the "'+OVL_TAB+'" tab.','Cocktail Codex',9);
}