/**
 * RecipeBlocks.gs — shared recipe-block helpers.
 *
 * Splits a description into recipe blocks, scores which block belongs to a drink,
 * and reads amounts off a line. Used by BuildAmounts (to parse only the drink's own
 * recipe) and by DescriptionSplitAudit (to check published amounts against it).
 * One copy, so the builder and the audit can never disagree about where a recipe
 * starts and ends. Apps Script shares one global scope across files, so nothing
 * needs importing -- but don't delete this file while either of those uses it.
 */

var DSA_UNIT = '(?:fl\\.?\\s*oz|oz|ounces?|ml|cl|tsp|teaspoons?|tbsp|tablespoons?|dash(?:es)?|drops?|barspoons?|bsp|parts?|cups?|sprigs?|leaves|slices?|wedges?|pinch(?:es)?|rinse|top)';
var DSA_QTY = '(?:\\d+\\s+\\d\\/\\d|\\d+\\/\\d+|\\d*\\.\\d+|\\d+|[\\u00bc\\u00bd\\u00be\\u2153\\u2154\\u215b]|\\d+\\s*[\\u00bc\\u00bd\\u00be\\u2153\\u2154\\u215b])';
var DSA_MEAS_RE = new RegExp('(^|[^\\w])' + DSA_QTY + '\\s*(?:-|\\u2013)?\\s*' + DSA_UNIT + '\\b', 'i');

function dsaIsMeas_(l) { return DSA_MEAS_RE.test(l); }

/* Split into blocks. A header is a short line with no measurement, followed (within two
   lines) by an ingredient line. Lines like "Ingredients:" or "Build in shaker" don't
   start a new recipe; they belong to the one in progress. An attribution line
   ("By Fanny Chu", "Recipe from Eastern Standard") takes the line above it as its title. */
var DSA_FRAC = '\u00bc\u00bd\u00be\u2153\u2154\u215b';
var DSA_GENERIC = /^[\s*_#]*(ingredients?|method|instructions?|directions?|recipe\(?s?\)?|garnish|glass(ware)?|tools?|steps?|build\b.*|shake\b.*|stir\b.*|strain\b.*|add\b.*|blend\b.*|top\b.*|serve\b.*|open pour\b.*|pour\b.*|salt the\b.*|rim\b.*|muddle\b.*|dry shake\b.*|whip\b.*|\**\s*recipe doubled\s*\**)\s*:?[\s*_]*$/i;
/* A method or section line ("Build in shaker", "Ingredients:"), ignoring decoration.
   Make & Drink writes its section header as "📖 *Recipe(s)* 📖"; with the emoji left
   on, it didn't count as generic, became the recipe's TITLE, and the cleaned cell
   started with "📖 (s) 📖". Emoji and symbols are stripped before testing now. */
function dsaGeneric_(l) {
  var t = String(l).replace(/[^\p{L}\p{N}\s():\/.\-]/gu, ' ').replace(/\s+/g, ' ').trim();
  return !t || DSA_GENERIC.test(t);
}
var DSA_ATTRIB = /^[\s*_]*(recipe\s+)?(by|from|credited to|courtesy of|adapted from)\b|recipe[\s*_]*$/i;
function dsaIsIng_(l) {
  if (dsaIsMeas_(l)) return true;
  if (/^\d{1,2}:\d{2}/.test(l)) return false;              // chapter timestamps
  if (/^\d+\.\s+\D/.test(l)) return false;                 // "1. THE SHRUNKEN SKULL"
  return new RegExp('^[\\-\\u2022*\\s]*(\\d|[' + DSA_FRAC + '])').test(l);   // "1 whole egg", "5 grapes"
}
function dsaBlocks_(text) {
  var lines = String(text).split(/\r?\n/).map(function (l) { return l.trim(); });
  var blocks = [], cur = { title: '', lines: [], meas: [] }, prevPlain = '';
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i]; if (!l) { prevPlain = ''; continue; }
    // A whole recipe on one line ("Classic Daiquiri - 2 oz rum, 1 oz lime, 3/4 oz simple")
    // is a block of its own: title before the dash/colon, each measurement after it.
    var inl = l.match(/^([^:\-\u2013\u2014\d]{3,50}?)\s*[:\-\u2013\u2014]\s+(.+)$/);
    if (inl) {
      var parts = inl[2].split(/\s*[,;]\s*|\s+(?:and|&)\s+/).filter(dsaIsMeas_);
      if (parts.length >= 2) {
        if (cur.lines.length) blocks.push(cur);
        blocks.push({ title: dsaCleanTitle_(inl[1]), lines: [l], meas: parts });
        cur = { title: '', lines: [], meas: [] }; prevPlain = ''; continue;
      }
    }
    var ing = dsaIsIng_(l);
    // The next real line must be an ingredient, skipping any number of method lines in
    // between: How to Drink writes "Frozen Paloma:" / "Build in the blender" /
    // "**Recipe Doubled**" / then the ingredients. v1 only allowed one such line, so
    // those titles were missed and every recipe in the video ran together untitled.
    var nextIng = false;
    for (var a = i + 1; a < lines.length && a <= i + 5; a++) {
      var la = lines[a]; if (!la) continue;
      if (dsaIsIng_(la)) { nextIng = true; break; }
      if (!dsaGeneric_(la)) break;
    }
    var isHeader = !ing && l.length <= 70 && !/^\d{1,2}:\d{2}/.test(l) && !dsaGeneric_(l) && !/https?:\/\/|www\./.test(l) && !/^[\-\u2022#]/.test(l) && nextIng;
    if (isHeader) {
      if (cur.meas.length) { blocks.push(cur); cur = { title: '', lines: [], meas: [] }; }
      var t = (DSA_ATTRIB.test(l) && prevPlain) ? prevPlain + ' \u2014 ' + l : l;
      cur.title = dsaCleanTitle_(t); cur.lines.push(l); prevPlain = ''; continue;
    }
    cur.lines.push(l); if (ing) cur.meas.push(l);
    prevPlain = (!ing && l.length <= 70 && !/https?:\/\//.test(l) && !dsaGeneric_(l)) ? l : '';
  }
  if (cur.lines.length) blocks.push(cur);
  return blocks;
}
function dsaCleanTitle_(t) {
  return String(t).replace(/\(\s*\d{1,2}:\d{2}\s*\)/g, '').replace(/\b\d{1,2}:\d{2}\b/g, '')
    .replace(/[*_#]+/g, '').replace(/\s*[:\-\u2013]\s*$/, '').replace(/\s+/g, ' ').trim();
}

var DSA_STOP = ['the', 'a', 'an', 'of', 'cocktail', 'recipe', 'by', 'from', 'no', 'and'];
// Tokenising every drink name for every block of every drink is ~millions of regex
// runs per build; names repeat, so cache them for the life of the execution.
var _DSA_TOK = {};
function dsaTokens_(s) {
  var k = String(s); if (_DSA_TOK.hasOwnProperty(k)) return _DSA_TOK[k];
  return (_DSA_TOK[k] = dsaTokensRaw_(k));
}
function dsaTokensRaw_(s) {
  return String(s).toLowerCase().replace(/\b\d{1,2}:\d{2}\b/g, ' ').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(function (t) { return t && (t.length > 1 || /\d/.test(t)) && DSA_STOP.indexOf(t) < 0; });
}

function dsaScore_(b, name, ings, allNames) {
  var s = 0, nt = dsaTokens_(name), tt = dsaTokens_(b.title);
  if (b.title) {
    var tl = tt.join(' '), nl = nt.join(' ');
    if (tl === nl) s += 4;
    else if (nl && (' ' + tl + ' ').indexOf(' ' + nl + ' ') > -1) s += 3;
    else s += nt.length ? 3 * nt.filter(function (t) { return tt.indexOf(t) > -1; }).length / nt.length : 0;
    // A number in the title that the name lacks ("Pago Pago No 2" vs "Pago Pago") is
    // strong evidence of a sibling recipe.
    s -= 1.5 * tt.filter(function (t) { return /^\d+$/.test(t) && nt.indexOf(t) < 0; }).length;
  }
  if (ings.length) {
    var have = ings.filter(function (i) { return dsaLinesFor_(b.meas, i.n).length; }).length;
    s += 2 * have / ings.length - 0.5 * Math.max(0, b.meas.length - ings.length) / Math.max(ings.length, 1);
  }
  return s;
}

/* The block's title names a DIFFERENT codex drink and not this one. */
function dsaOtherOwner_(title, name, allNames) {
  var tt = ' ' + dsaTokens_(title).join(' ') + ' ', nt = dsaTokens_(name).join(' ');
  if (!title || (nt && tt.indexOf(' ' + nt + ' ') > -1)) return '';
  var hit = '';
  allNames.forEach(function (o) {
    var ot = dsaTokens_(o).join(' ');
    if (!hit && ot.length > 4 && ot !== nt && tt.indexOf(' ' + ot + ' ') > -1) hit = o;
  });
  return hit;
}

/* Every line in the block that mentions this ingredient: the full name, or else every
   meaningful word of it ("Islay Scotch" needs both islay AND scotch, so a blended
   Scotch line no longer counts). URLs are stripped first -- a link containing
   "spicy-with-tequila" is not a tequila line. */
var DSA_GENERIC_ING = ['juice', 'syrup', 'liqueur', 'bitters', 'fresh', 'float', 'rinse', 'of'];
function dsaLinesFor_(lines, ing) {
  var il = ing.toLowerCase();
  var clean = lines.map(function (l) { return { l: l, c: l.replace(/https?:\/\/\S+|www\.\S+/gi, ' ').toLowerCase() }; });
  // A float or rinse row only matches a line that says float/rinse -- "Float of Rum"
  // is not the 1 oz of white rum in the build.
  var mode = (il.match(/\b(float|rinse|mist)\b/) || [])[1];
  if (mode) clean = clean.filter(function (x) { return new RegExp('\\b' + mode).test(x.c); });
  // Whole-word match, so "Ice" doesn't match "juice".
  var esc = il.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var direct = clean.filter(function (x) { return new RegExp('(^|[^a-z])' + esc + '([^a-z]|$)').test(x.c); });
  if (direct.length) return direct.map(function (x) { return x.l; });
  var words = dsaTokens_(ing).filter(function (t) { return DSA_GENERIC_ING.indexOf(t) < 0; });
  var byWords = !words.length ? [] : clean.filter(function (x) { return words.every(function (w) { return new RegExp('\\b' + w + '\\b').test(x.c); }); });
  if (byWords.length) return byWords.map(function (x) { return x.l; });
  // Ingredient library (IngredientLibrary.gs): "Averna" is an Amaro line, "Fortaleza" a
  // Tequila line, "3/4 oz lime" a Lime Juice line. Float/rinse rows were filtered above.
  if (typeof ingMatch_ !== 'function') return [];
  return clean.filter(function (x) { return !!ingMatch_(x.c, ing); }).map(function (x) { return x.l; });
}
function dsaFindLine_(lines, ing) { var r = dsaLinesFor_(lines, ing); return r.length === 1 ? r[0] : null; }

/* Every amount on a line, so "2 barspoons honey (or 1/2 oz honey syrup)" and
   "1/45oz (7.5ml)" both offer each of their readings. */
function dsaQtys_(line) {
  var c = String(line).replace(/https?:\/\/\S+/gi, ' ');
  var re = new RegExp('(' + DSA_QTY + ')\\s*(?:-|\\u2013)?\\s*(' + DSA_UNIT + ')\\b', 'gi'), m, out = [];
  while ((m = re.exec(c))) {
    var q = dsaParseQty_(m[1]); if (q == null || !isFinite(q)) continue;
    out.push({ q: q, u: m[2].toLowerCase(), raw: m[0].trim(), oz: dsaToOz_(q, m[2]) });
  }
  return out;
}
function dsaParseQty_(str) {
  var frac = { '\u00bc': .25, '\u00bd': .5, '\u00be': .75, '\u2153': 1 / 3, '\u2154': 2 / 3, '\u215b': .125 };
  var q = 0, ok = false;
  String(str).trim().split(/\s+/).forEach(function (p) {
    var fm = p.match(/^(\d*)([\u00bc\u00bd\u00be\u2153\u2154\u215b])$/);
    if (fm) { q += (fm[1] ? +fm[1] : 0) + frac[fm[2]]; ok = true; return; }
    if (p.indexOf('/') > -1) { var f = p.split('/'); if (+f[1]) { q += (+f[0]) / (+f[1]); ok = true; } return; }
    var n = parseFloat(p); if (!isNaN(n)) { q += n; ok = true; }
  });
  return ok ? q : null;
}
/* Suggest in the published unit when the recipe is in a liquid measure; otherwise
   repeat the recipe's own wording ("1 dash"), never a rounded-to-zero ounce figure. */
function dsaFmtFix_(oz, unit, q) {
  if (/oz/i.test(unit) && /oz|ounce|ml|cl/i.test(q.u)) { var r = Math.round(oz * 8) / 8; if (r > 0) return (Math.round(r * 1000) / 1000) + ' ' + unit; }
  return q.raw;
}

function dsaQty_(line) { var q = dsaQtys_(line); return q.length ? q[0] : null; }

function dsaToOz_(q, u) {
  u = String(u || '').toLowerCase();
  if (/oz|ounce/.test(u)) return +q;
  if (/^ml/.test(u)) return q / 29.57;
  if (/^cl/.test(u)) return q / 2.957;
  if (/tbsp|tablespoon/.test(u)) return q / 2;
  if (/tsp|teaspoon|barspoon|bsp/.test(u)) return q / 6;
  if (/dash/.test(u)) return q / 32;
  return null;   // drops, leaves, parts, etc.: not compared
}

function dsaNormLine_(l) { return String(l).toLowerCase().replace(/^[\s\-\u2022*\u00b7\d.)]+(?=\D)/, '').replace(/\s+/g, ' ').trim(); }
function dsaNormUrl_(u) {
  return String(u || '').trim().replace(/[?&]si=[^&]*/, '').replace(/^https?:\/\/(www\.|m\.)?/, '')
    .replace(/youtu\.be\//, 'youtube.com/watch?v=').replace(/youtube\.com\/shorts\//, 'youtube.com/watch?v=').replace(/\/$/, '');
}