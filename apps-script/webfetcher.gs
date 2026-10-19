/**
 * Cocktail Codex — Fetch descriptions from NON-YouTube links  (v4)
 * ---------------------------------------------------------------
 * Fills the description column for rows whose Source link is a recipe site or Reddit post.
 * YouTube is handled by the other script; Instagram is skipped (do by hand).
 *
 * v2: BODY-TEXT FALLBACK (Shopify/brand pages) + fraction-aware measurement guard.
 * v3 (this): fixes the "clipped Liber & Co description" problem.
 *   - HARDENED FALLBACK: Shopify truncates og:description to ~320 chars mid-word.
 *     v1 wrote those blobs, which lose every amount past char 320. v3 refuses a
 *     meta description that looks truncated (>=290 chars) — better blank than clipped.
 *   - refetchClippedDescriptions(): RE-FETCHES only the already-clipped rows and
 *     overwrites them with the good body-text extraction. Normal fetch skips rows
 *     that already have text (>=30 chars), so those old clips were stuck; this
 *     targets them by their signature (a single-blob og:description). It requires
 *     the fresh text to be multi-line before overwriting, so it never replaces a
 *     clip with another clip. Menu: Cocktail Codex -> 1 Descriptions -> Re-fetch
 *     clipped descriptions.  (Run Build Amounts afterward to map the recovered
 *     amounts; your manual amount rows are preserved as always.)
 *
 * v4 (this): SHOPIFY PRODUCT JSON. Liber & Co (and other Shopify stores) render the
 *   recipe with JavaScript from a <script> blob, so UrlFetchApp (no JS) never saw it
 *   and fell back to the truncated og:description. v4 asks Shopify's Ajax Product API
 *   (/products/{handle}.js) for the product directly — full description, server-side,
 *   no JS, no truncation — and parses the recipe from that. This is why the earlier
 *   re-fetch found the clipped rows but couldn't repair them; now it can.
 *
 * SAFE TO RE-RUN: fetchWebDescriptions only fills BLANK rows. refetchClipped only
 * touches rows whose description matches the clipped signature.
 */

// ---- CONFIG ---------------------------------------------------------------
var W_SHEET='Cocktails', W_FIRST_ROW=2;
// resolved by header, see Config.gs
var W_NAME_COL=COL('Name'), W_SRC_COL=COL('Source'), W_DESC_COL=COL('YT_Description');
var W_UA='Mozilla/5.0 (compatible; CocktailCodex/1.0)';
var W_SLEEP_MS=400;
var W_MAX_PER_RUN=120;   // stay under the 6-min cap; re-run to continue
var W_META_MAX=290;      // meta descriptions at/above this are treated as truncated
// ---------------------------------------------------------------------------

function fetchWebDescriptions(){
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName(W_SHEET); if(!sh)throw new Error('Sheet "'+W_SHEET+'" not found.');
  var n=sh.getLastRow()-W_FIRST_ROW+1;
  var descVals=sh.getRange(W_FIRST_ROW,W_DESC_COL,n,1).getValues();

  var done=0,wrote=0,noRecipe=0,failed=0;
  for(var i=0;i<n && done<W_MAX_PER_RUN;i++){
    var row=W_FIRST_ROW+i;
    if(String(descVals[i][0]||'').length>=30) continue;   // already has description
    var url=urlFromCell_(sh.getRange(row,W_SRC_COL));       // helper from YT script
    if(!url) continue;
    var host=(url.split('/')[2]||'').toLowerCase();
    if(host.indexOf('youtu')>-1) continue;
    if(host.indexOf('instagram')>-1) continue;             // manual

    done++;
    var text='';
    try{ text=(host.indexOf('reddit.com')>-1)?fetchReddit_(url):fetchRecipeSite_(url); }
    catch(e){ failed++; Utilities.sleep(W_SLEEP_MS); continue; }

    if(text && hasMeasurement_(text)){ sh.getRange(row,W_DESC_COL).setValue(text); wrote++; }
    else noRecipe++;
    Utilities.sleep(W_SLEEP_MS);
  }
  SpreadsheetApp.getActive().toast(
    'Web fetch: tried '+done+', wrote '+wrote+', no-recipe '+noRecipe+', errors '+failed+
    (done>=W_MAX_PER_RUN?' — hit per-run cap, run again to continue.':'.'),'Cocktail Codex',8);
}

/**
 * Re-fetch ONLY the rows whose description is a clipped og:description blob
 * (the v1 Shopify problem), and overwrite them with clean body-text extraction.
 */
function refetchClippedDescriptions(){
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName(W_SHEET); if(!sh)throw new Error('Sheet "'+W_SHEET+'" not found.');
  var n=sh.getLastRow()-W_FIRST_ROW+1;
  var descVals=sh.getRange(W_FIRST_ROW,W_DESC_COL,n,1).getValues();

  var done=0,fixed=0,stillClipped=0,failed=0;
  for(var i=0;i<n && done<W_MAX_PER_RUN;i++){
    var row=W_FIRST_ROW+i;
    var cur=String(descVals[i][0]||'');
    if(!looksClipped_(cur)) continue;
    var url=urlFromCell_(sh.getRange(row,W_SRC_COL));
    if(!url) continue;
    var host=(url.split('/')[2]||'').toLowerCase();
    if(host.indexOf('youtu')>-1 || host.indexOf('instagram')>-1) continue;

    done++;
    var text='';
    try{ text=(host.indexOf('reddit.com')>-1)?fetchReddit_(url):fetchRecipeSite_(url); }
    catch(e){ failed++; Utilities.sleep(W_SLEEP_MS); continue; }

    // only overwrite if we recovered a real, multi-line ingredient list (not another blob)
    if(text && hasMeasurement_(text) && text.indexOf('\n')>-1 && text.length>cur.length*0.6){
      sh.getRange(row,W_DESC_COL).setValue(text); fixed++;
    } else { stillClipped++; }
    Utilities.sleep(W_SLEEP_MS);
  }
  SpreadsheetApp.getActive().toast(
    'Re-fetch clipped: found '+done+', fixed '+fixed+', still-clipped '+stillClipped+', errors '+failed+
    (fixed?'  — now run Build Amounts to map the recovered amounts.':'')+
    (done>=W_MAX_PER_RUN?'  (hit per-run cap; run again.)':''),'Cocktail Codex',10);
}

/** A description that looks like a single-blob (truncated) og:description. */
function looksClipped_(d){
  d=String(d||''); if(!d) return false;
  var oneBlob = d.indexOf('\n')===-1;                 // good body extraction is multi-line
  if(!oneBlob) return false;
  var capish = d.length>=300 && d.length<=340;         // Shopify's ~320 truncation
  var recipeProse = /ingredients?\s*:/i.test(d) && /instructions?\s*:/i.test(d);
  return capish || recipeProse;
}

// --- fraction-aware measurement guard --------------------------------------
function hasMeasurement_(t){
  return /(?:\d|[\u00BC\u00BD\u00BE\u2153\u2154\u215B-\u215E])\s*(?:fl\s*oz|oz|ounce|ml|cl|dash|barspoon|bar\s*spoon|tsp|teaspoon|tbsp|tablespoon|part|drop)/i.test(String(t));
}

// --- recipe site: JSON-LD first, then body-text fallback -------------------
function fetchRecipeSite_(url){
  // Shopify stores (Liber & Co, etc.) render recipes via JS; ask the Ajax Product
  // API for the structured product instead of scraping the rendered page.
  if(url.indexOf('/products/')>-1){
    var shop=fetchShopifyProduct_(url);
    if(shop) return shop;
  }
  var resp=UrlFetchApp.fetch(url,{muteHttpExceptions:true,followRedirects:true,headers:{'User-Agent':W_UA,'Accept':'text/html'}});
  if(resp.getResponseCode()>=400) return '';
  var html=resp.getContentText();

  var ings=extractJsonLdIngredients_(html);
  if(ings && ings.length>=2) return ings.join('\n');

  // fallback: strip to text, keep measurement-bearing lines
  var body=cleanBody_(html);
  if(hasMeasurement_(body)) return body;

  // last resort: meta description — but ONLY if it looks complete. Shopify (and
  // many CMSs) truncate og:description ~320 chars mid-word; writing that blob is
  // exactly what created the clipped, amount-losing entries. Refuse long ones.
  var meta = metaContent_(html,'og:description') || metaContent_(html,'description') || '';
  if(meta && meta.length < W_META_MAX) return meta;
  return '';
}

// --- Shopify Ajax Product API: /products/{handle}.js (then .json) -----------
function fetchShopifyProduct_(url){
  try{
    var u=url.split('#')[0].split('?')[0].replace(/\/$/,'');
    var m=u.match(/^(https?:\/\/[^\/]+)(?:\/[^\/]+)*\/products\/([^\/]+)$/);
    if(!m) return '';
    var base=m[1], handle=m[2];
    var eps=[base+'/products/'+handle+'.js', base+'/products/'+handle+'.json'];
    for(var i=0;i<eps.length;i++){
      var resp;
      try{ resp=UrlFetchApp.fetch(eps[i],{muteHttpExceptions:true,followRedirects:true,headers:{'User-Agent':W_UA,'Accept':'application/json'}}); }
      catch(e){ continue; }
      if(resp.getResponseCode()>=400) continue;
      var data; try{ data=JSON.parse(resp.getContentText()); }catch(e){ continue; }
      var descHtml = data.description || (data.product && data.product.body_html) || '';
      if(descHtml){
        var lines=cleanBody_(descHtml);
        if(hasMeasurement_(lines)) return lines;
      }
    }
  }catch(e){}
  return '';
}

function cleanBody_(html){
  var h=html
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<head[\s\S]*?<\/head>/gi,' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi,' ');
  // turn block ends and bullet separators into line breaks so each
  // ingredient lands on its own line (critical: "½ oz A · ½ oz B" must split)
  h=h.replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/span)[^>]*>/gi,'\n')
     .replace(/[·•|]/g,'\n');
  h=h.replace(/<[^>]+>/g,' ');
  h=decodeEntities_(h);
  var lines=h.split('\n').map(function(x){return x.replace(/\s+/g,' ').trim();}).filter(Boolean);
  // keep short, measurement-bearing lines (skip long prose paragraphs)
  var keep=[];
  for(var i=0;i<lines.length;i++){ if(lines[i].length<=120 && hasMeasurement_(lines[i])) keep.push(lines[i]); }
  // de-dupe consecutive repeats (sites often render the recipe twice)
  var out=[],seen={};
  for(var j=0;j<keep.length;j++){ if(!seen[keep[j]]){ out.push(keep[j]); seen[keep[j]]=true; } }
  return out.join('\n');
}

function extractJsonLdIngredients_(html){
  var blocks=html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/ig);
  if(!blocks) return null;
  for(var b=0;b<blocks.length;b++){
    var json=blocks[b].replace(/<script[^>]*>/i,'').replace(/<\/script>/i,'').trim();
    var data; try{ data=JSON.parse(json); }catch(e){ continue; }
    var found=findRecipeIngredients_(data);
    if(found && found.length) return found.map(decodeEntities_);
  }
  return null;
}
function findRecipeIngredients_(node){
  if(!node||typeof node!=='object') return null;
  if(Array.isArray(node)){ for(var i=0;i<node.length;i++){ var r=findRecipeIngredients_(node[i]); if(r)return r; } return null; }
  var t=node['@type'];
  var isRecipe=t&&(t==='Recipe'||(Array.isArray(t)&&t.indexOf('Recipe')>-1));
  if(isRecipe){
    var ing=node.recipeIngredient||node.ingredients;
    if(Array.isArray(ing)&&ing.length) return ing.map(function(x){return String(x).trim();});
    if(typeof ing==='string'&&ing.trim()) return [ing.trim()];
  }
  if(node['@graph']){ var g=findRecipeIngredients_(node['@graph']); if(g)return g; }
  for(var k in node){ if(k==='@graph')continue; if(node[k]&&typeof node[k]==='object'){ var d=findRecipeIngredients_(node[k]); if(d)return d; } }
  return null;
}
function metaContent_(html,name){
  var re1=new RegExp('<meta[^>]+(?:property|name)=["\']'+name+'["\'][^>]+content=["\']([^"\']+)["\']','i');
  var re2=new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']'+name+'["\']','i');
  var m=html.match(re1)||html.match(re2);
  return m?decodeEntities_(m[1]):'';
}

// --- reddit ----------------------------------------------------------------
function fetchReddit_(url){
  var clean=url.split('?')[0].replace(/\/$/,'')+'.json';
  var resp=UrlFetchApp.fetch(clean,{muteHttpExceptions:true,followRedirects:true,headers:{'User-Agent':W_UA,'Accept':'application/json'}});
  if(resp.getResponseCode()>=400) return '';
  var data; try{ data=JSON.parse(resp.getContentText()); }catch(e){ return ''; }
  var post=data&&data[0]&&data[0].data&&data[0].data.children&&data[0].data.children[0]&&data[0].data.children[0].data;
  if(!post) return '';
  var title=post.title||'', body=post.selftext||'';
  if(!hasMeasurement_(body)){
    var comments=(data[1]&&data[1].data&&data[1].data.children)||[];
    for(var i=0;i<comments.length;i++){ var c=comments[i].data; if(c&&c.body&&hasMeasurement_(c.body)){ body=c.body; break; } }
  }
  return (title+'\n'+body).trim();
}

// --- entity decode ---------------------------------------------------------
function decodeEntities_(s){
  return String(s)
    .replace(/&frac12;/g,'1/2').replace(/&frac14;/g,'1/4').replace(/&frac34;/g,'3/4')
    .replace(/&#189;/g,'1/2').replace(/&#188;/g,'1/4').replace(/&#190;/g,'3/4')
    .replace(/&amp;/g,'&').replace(/&nbsp;/g,' ')
    .replace(/&#(\d+);/g,function(_,d){return String.fromCharCode(parseInt(d,10));})
    .replace(/&[a-z]+;/gi,' ').trim();
}