/**
 * Cocktail Codex — Ingredient Library  (v1)
 * ------------------------------------------------------------------------
 * ONE glossary behind every "does this line mention this ingredient?" question:
 *   BuildAmounts     (which amount belongs to which Cocktails ingredient)
 *   RecipeBlocks     (which recipe block in a description is this drink's)
 *   CleanDescriptions (which lines are ingredient lines worth keeping)
 * Before this, BuildAmounts had a 25-entry SYN list and the other two had none, so
 * "1 oz Averna", "2 oz Fortaleza blanco", "3/4 oz lime" or "1/2 oz Ramazotti" found
 * nothing: the sheet says Amaro / Tequila / Lime Juice / Amaro Ramazzotti and the
 * description says the brand, the short form, or a misspelling.
 *
 * HOW A LINE IS MATCHED
 *   Text and terms are normalised the same way (lowercase, accents off, & -> and,
 *   apostrophes dropped, punctuation -> space), then a term must appear as WHOLE
 *   WORDS: "rum" never matches "rumchata", "ice" never matches "juice".
 *   Terms for an ingredient come from, in order:
 *     1. its own name (plus singular/plural of the last word)
 *     2. ING_LIBRARY below (brands, styles, spellings, short forms)
 *     3. derived short forms: "Lime Juice" -> "lime", "Honey Syrup" -> "honey",
 *        "Banana Liqueur" -> "banana". These carry a NEXT-WORD BLOCK so "lime" does not
 *        fire on "lime wheel"/"lime cordial", "honey" not on "honey liqueur",
 *        "demerara" not on "demerara rum", "ginger" not on "ginger beer".
 *     4. the old token rule as a last resort (every word of the name anywhere)
 *
 * WHEN TWO INGREDIENTS CLAIM THE SAME LINE (BuildAmounts only)
 *   "1/2 oz Hamilton Pimento Dram" matches Rum (Hamilton is a rum brand) AND Allspice
 *   Liqueur. The old matcher gave the amount to both. Now the line goes to ONE winner:
 *   take the earliest match, gather any match that overlaps it or starts on the very
 *   next word, and the LONGEST of those wins (a tie goes to the later one, i.e. the
 *   word after the brand). So Hamilton|Pimento Dram -> Allspice, Plymouth|Sloe Gin ->
 *   Sloe Gin, Pierre Ferrand Dry Curacao -> Curacao not Cognac, "Angostura amaro" ->
 *   Amaro di Angostura not the bitters, "lime juice (or lemon)" -> Lime. On an exact
 *   tie the NARROWER ingredient wins: "Laphroaig" -> Islay Scotch over Scotch. Only kicks in
 *   when the drink actually has both ingredients; otherwise nothing changes.
 *
 * FLOATS AND RINSES: "Float of Mezcal" / "Absinthe Rinse" use the base spirit's terms
 *   but only match a line that also says float / rinse / mist, as RecipeBlocks did.
 *
 * ADDING TERMS
 *   Everything lives in ING_LIBRARY below -- no tabs to maintain. Keys are the Cocktails
 *   ingredient names in any case/accents ("Curaçao" and "curacao" are the same key);
 *   values are extra terms, same rules. Add a brand to an existing list, or a new
 *   key for a new ingredient, save, then Preview Build Amounts to see what it picks up.
 *   To see which ingredients still match on their bare name only, run
 *   glossaryCoverage from the script editor (function dropdown -> Run). It is
 *   deliberately not on the menu.
 */

/* ── Brand families, shared by the generic spirit and any narrower entry ────── */
var LIB_RUM = ['plantation','planteray','appleton','appleton estate','smith and cross','hamilton',
  'el dorado','diplomatico','bacardi','havana club','mount gay','doorlys','foursquare','wray and nephew',
  'pussers','goslings','cruzan','flor de cana','banks','banks 5','banks 7','denizen','probitas',
  'worthy park','hampden','rum fire','myerss','myers','lemon hart','coruba','kraken','sailor jerry',
  'brugal','don q','ron zacapa','zacapa','barbancourt','black tot','chairmans reserve','duncan taylor',
  'clairin','rhum','ron','overproof rum','blackstrap','lost spirits','real mccoy','rhum jm','saint james',
  'st james','neisson','clement','la favorite','trois rivieres','dos maderas','bumbu','kohana',
  'koloa','privateer','owney','uncle nearest rum','stiggins','planteray xaymaca','xaymaca',
  'o f t d','oftd','jamaican rum','demerara rum','guyanese rum','haitian rum','barbados rum',
  'puerto rican rum','cuban rum','aged rum','white rum','light rum','dark rum','gold rum','black rum',
  'navy rum','spiced rum','151'];
var LIB_TEQUILA = ['fortaleza','siete leguas','el tesoro','tapatio','cimarron','pueblo viejo','espolon',
  'olmeca altos','altos','patron','don julio','casamigos','herradura','el jimador','cazadores','arette',
  'g4','tequila ocho','ocho','la gritona','mijenta','lalo','cascahuin','volcan','partida','tres agaves',
  'codigo','clase azul','corralejo','milagro','teremana','casa noble','avion','gran centenario',
  'tequila blanco','blanco tequila','blanco','plata','silver tequila','reposado','anejo','extra anejo',
  'highland tequila','lowland tequila'];
var LIB_MEZCAL = ['del maguey','vida','ilegal','montelobos','banhez','bahnez','sombra','la luna',
  'rey campero','derrumbes','siete misterios','los siete misterios','400 conejos','wahaka','alipus',
  'vago','mezcal vago','madre mezcal','bozal','nuestra soledad','pierde almas','el silencio',
  'espadin','tobala','mezcal union','union uno','fidencio','yuu baal','ojo de tigre','mezcalero',
  'el buho','creyente','lost explorer','dos hombres'];
var LIB_GIN = ['beefeater','tanqueray','plymouth','bombay','bombay sapphire','hendricks','sipsmith',
  'fords','aviation','monkey 47','botanist','the botanist','roku','no 3','haymans','citadelle',
  'gordons','brokers','bimini','malfy','fifty pounds','junipero','london dry','navy strength',
  'old tom','opihr','nikka coffey gin','empress','empress 1908','barr hill','st george terroir',
  'gin mare','drumshanbo','tanqueray ten','tanqueray no ten','martin millers','greenalls'];
var LIB_BOURBON = ['buffalo trace','wild turkey','four roses','makers mark','woodford','woodford reserve',
  'old forester','elijah craig','evan williams','old grand dad','eagle rare','larceny','weller',
  'knob creek','jim beam','heaven hill','1792','old fitzgerald','basil hayden','henry mckenna',
  'bulleit bourbon','michters bourbon','old crow','benchmark','very old barton','wild turkey 101',
  'russells reserve','blantons','angels envy','uncle nearest','high west bourbon','bookers',
  'bakers','old weller'];
var LIB_RYE = ['rye','rittenhouse','old overholt','overholt','pikesville','high west','bulleit rye',
  'michters rye','whistlepig','whistle pig','templeton','sazerac rye','wild turkey rye','knob creek rye',
  'old forester rye','jim beam rye','redemption','dickel rye','russells rye','hudson rye','bonded rye',
  'rye whisky','rye whiskey'];
var LIB_SCOTCH = ['scotch','single malt','blended scotch','blended malt','johnnie walker','monkey shoulder',
  'laphroaig','laphroig','ardbeg','lagavulin','glenlivet','glenfiddich','macallan','famous grouse',
  'dewars','chivas','talisker','caol ila','bowmore','highland park','compass box','peat monster',
  'islay','springbank','oban','balvenie','glenmorangie','aberlour','naked grouse','bank note',
  'great king street','pig nose','peated scotch','islay scotch'];
var LIB_ISLAY = ['islay','islay scotch','laphroaig','laphroig','ardbeg','lagavulin','caol ila','bowmore',
  'peat monster','peated scotch','octomore','port charlotte','kilchoman','bruichladdich'];
var LIB_IRISH = ['irish whiskey','irish','jameson','redbreast','powers','bushmills','tullamore','tullamore dew',
  'teeling','green spot','writers tears','slane','knappogue','method and madness','roe and co'];
var LIB_COGNAC = ['cognac','pierre ferrand','ferrand','pierre ferrand 1840','1840','hennessy','remy martin',
  'remy','courvoisier','martell','h by hine','camus','park cognac','vsop','vs cognac','frapin','delamain',
  'maison rouge','louis royer','salignac','merlet'];
var LIB_BRANDY = ['brandy','armagnac','spanish brandy','brandy de jerez','torres','asbach','metaxa',
  'st remy','e and j','christian brothers','germain robin','copper and kings'];
var LIB_AMARO = ['amaro','averna','montenegro','nonino','ramazzotti','ramazotti','ramazzoti','meletti',
  'braulio','ciociaro','cynar','lucano','cardamaro','sfumato','nardini','cappelletti','amaro dell etna',
  'amaro di angostura','fernet','montenegro amaro','zucca','pasubio','foro','amara','bigallet',
  'china china','amer picon','picon','jeppsons','malort','bràulio','santoni','tosolini','vecchio amaro',
  'amaro sibilla','sibilla','varnelli','amaro alta verde','alta verde','amaro nonino quintessentia'];

/* ── The library. Key = Cocktails ingredient name; value = extra terms. ───── */
var ING_LIBRARY = {
  /* Spirits */
  'rum': LIB_RUM,
  'rhum agricole': ['agricole','rhum agricole','rhum','clement','neisson','rhum jm','jm rhum','saint james',
    'st james','la favorite','trois rivieres','duquesne','depaz','damoiseau','bielle','hse','dillon',
    'barbancourt','clairin','cane juice rum','martinique rum','rhum blanc','rhum vieux'],
  'pineapple rum': ['pineapple rum','plantation pineapple','planteray pineapple','stiggins','stiggins fancy',
    'pineapple infused rum'],
  'coconut rum': ['coconut rum','malibu','koloa coconut','cruzan coconut','parrot bay'],
  'charanda': ['charanda','uruapan','charanda uruapan'],
  'cachaca': ['cachaca','avua','novo fogo','leblon','ypioca','yaguara','capucana','pitu','51 cachaca'],
  'tequila': LIB_TEQUILA,
  'mezcal': LIB_MEZCAL,
  'sotol': ['sotol','desert door','por siempre','hacienda de chihuahua','clande'],
  'gin': LIB_GIN,
  'sloe gin': ['sloe gin','sloe','plymouth sloe','hayman sloe','haymans sloe'],
  'genever': ['genever','jenever','bols genever','old duff','geneva'],
  'vodka': ['vodka','titos','absolut','grey goose','ketel one','belvedere','stoli','stolichnaya',
    'smirnoff','chopin','reyka','haku','wheatley'],
  'aquavit': ['aquavit','akvavit','linie','aalborg','krogstad','o p anderson'],
  'pisco': ['pisco','barsol','la diablada','macchu pisco','capurro','campo de encanto','porton','pisco porton',
    'quebranta','acholado','kappa','caravedo','1615'],
  'grappa': ['grappa','nardini grappa','nonino grappa','poli grappa'],
  'bourbon': LIB_BOURBON,
  'rye whiskey': LIB_RYE,
  'white rye whiskey': ['white rye','unaged rye','white dog rye','rye white dog'],
  'scotch': LIB_SCOTCH,
  'islay scotch': LIB_ISLAY,
  'irish whiskey': LIB_IRISH,
  'cognac': LIB_COGNAC,
  'brandy': LIB_BRANDY.concat(LIB_COGNAC),
  'apple brandy': ['apple brandy','applejack','apple jack','calvados','bonded applejack','lairds',
    'lairds applejack','lairds bonded','pays dauge','christian drouin','drouin','boulard','pere magloire',
    'busnel','clear creek apple','copper and kings apple'],
  'pineapple brandy': ['pineapple brandy','pineapple eau de vie'],
  'cherry brandy': ['cherry brandy','kirsch','kirschwasser','cherry heering','heering'],
  'apricot eau de vie': ['apricot eau de vie','abricot eau de vie','blume marillen','marillen'],
  'guava eau de vie': ['guava eau de vie'],
  'pimms no 1': ['pimms','pimms no 1','pimm s','pimms cup'],
  'any spirit': ['spirit','base spirit','any spirit','your spirit','spirit of choice'],

  /* Vermouth, aromatised and fortified wine */
  'sweet vermouth': ['sweet vermouth','rosso','vermouth rosso','rosso vermouth','di torino','vermouth di torino',
    'cocchi torino','cocchi vermouth di torino','carpano','carpano antica','antica formula','punt e mes',
    'cinzano','cinzano rosso','martini rosso','martini and rossi rosso','dolin rouge','dolin rosso',
    'mancino rosso','la quintinye rouge','italian vermouth','red vermouth','vermouth rouge','cocchi di torino',
    'del professore rosso','alessio','alessio vermouth'],
  'carpano antica': ['carpano antica','antica formula','carpano antica formula','carpano'],
  'punt e mes': ['punt e mes','puntemes'],
  'dry vermouth': ['dry vermouth','extra dry vermouth','extra dry','vermouth dry','french vermouth','dolin dry',
    'noilly prat','noilly','martini extra dry','mancino secco','la quintinye extra dry','cinzano extra dry',
    'vermouth de chambery','chambery'],
  'blanc vermouth': ['blanc vermouth','bianco vermouth','vermouth blanc','vermouth bianco','bianco','dolin blanc',
    'martini bianco','carpano bianco','mancino bianco','cinzano bianco','la quintinye blanc','blanc'],
  'lillet blanc': ['lillet blanc','lillet','kina lillet'],
  'cocchi americano': ['cocchi americano','americano bianco','cocchi americano bianco','cocchi','kina'],
  'cocchi rosa': ['cocchi rosa','americano rosa','cocchi americano rosa'],
  'bitter bianco': ['bitter bianco','contratto bianco','campari bianco','lo fi bitter bianco'],
  'sherry': ['sherry','fino','amontillado','oloroso','olorosso','manzanilla','pedro ximenez','px','cream sherry'],
  'fino sherry': ['fino','fino sherry','tio pepe','la ina','lustau fino'],
  'amontillado sherry': ['amontillado','amontillado sherry','lustau amontillado','los arcos'],
  'manzanilla sherry': ['manzanilla','manzanilla sherry','la gitana','hidalgo manzanilla','papirusa'],
  'olorosso sherry': ['oloroso','olorosso','oloroso sherry','lustau oloroso','don nuno'],
  'px sherry': ['pedro ximenez','px','px sherry','pedro ximenez sherry'],
  'port wine': ['port','ruby port','tawny port','port wine','porto','late bottled vintage','lbv port'],
  'marsala wine': ['marsala','marsala wine','dry marsala','sweet marsala'],
  'sparkling wine': ['sparkling wine','champagne','prosecco','cava','cremant','brut','sparkling','bubbles','sekt'],
  'champagne': ['champagne','sparkling wine','prosecco','cava','cremant','brut','bubbles'],
  'malbec': ['malbec','red wine','dry red wine'],

  /* Bitter liqueurs and amari */
  'campari': ['campari','bitter campari','campari bitter'],
  'aperol': ['aperol'],
  'amaro': LIB_AMARO,
  'amaro averna': ['averna','amaro averna'],
  'amaro montenegro': ['montenegro','amaro montenegro'],
  'amaro nonino': ['nonino','amaro nonino','nonino quintessentia','quintessentia'],
  'amaro ramazzotti': ['ramazzotti','ramazotti','ramazzoti','ramazoti','amaro ramazzotti','amaro ramazotti'],
  'amaro braulio': ['braulio','amaro braulio'],
  'amaro meletti': ['meletti','amaro meletti'],
  'amaro ciociaro': ['ciociaro','amaro ciociaro','paolucci ciociaro'],
  'amaro pasubio': ['pasubio','amaro pasubio','cappelletti pasubio','vino amaro pasubio'],
  'amaro di angostura': ['amaro di angostura','angostura amaro','amaro angostura'],
  'cardamaro': ['cardamaro','cardamaro vino amaro','vino amaro'],
  'cynar': ['cynar','cynar 70','artichoke amaro','artichoke liqueur'],
  'fernet branca': ['fernet','fernet branca','fernet-branca','branca','fernet vallet','vallet'],
  'branca menta': ['branca menta','brancamenta','fernet menta'],
  'amer picon': ['amer picon','picon','amer boudreau','bigallet china china','china china','torani amer'],
  'jagermeister': ['jagermeister','jager'],
  'underberg': ['underberg'],
  'suze': ['suze','salers','aveze','gentian liqueur','gentiane','gentian','bonal'],
  'strega': ['strega','liquore strega'],

  /* Herbal, fruit and other liqueurs */
  'chartreuse': ['chartreuse','green chartreuse','chartreuse verte','verte'],
  'yellow chartreuse': ['yellow chartreuse','chartreuse jaune','jaune','dumante'],
  'benedictine': ['benedictine','dom benedictine','b and b','d o m'],
  'drambuie': ['drambuie'],
  'licor 43': ['licor 43','cuarenta y tres','licor cuarenta y tres'],
  'st germain': ['st germain','saint germain','st-germain','elderflower','elderflower liqueur','fiorente',
    'st elder','drillaud elderflower','giffard elderflower','pages fleur de sureau','fleur de sureau'],
  'orange liqueur': ['orange liqueur','cointreau','triple sec','grand marnier','dry curacao','orange curacao',
    'curacao','combier','pierre ferrand dry curacao','ferrand dry curacao','clement creole shrubb',
    'creole shrubb','mandarine napoleon','luxardo triplum','giffard triple sec'],
  'cointreau': ['cointreau','triple sec','combier'],
  'curacao': ['curacao','dry curacao','orange curacao','pierre ferrand dry curacao','ferrand dry curacao',
    'senior curacao','ferrand curacao','marie brizard curacao'],
  'blue curacao': ['blue curacao','bols blue','senior blue','giffard blue curacao'],
  'yuzu curacao': ['yuzu curacao','pierre ferrand yuzu'],
  'falernum': ['falernum','velvet falernum','john d taylor','john d taylors','taylors velvet','bg reynolds falernum'],
  'allspice liqueur': ['allspice liqueur','allspice dram','pimento dram','st elizabeth','st elizabeth allspice',
    'hamilton pimento dram','pimento liqueur','dram'],
  'banana liqueur': ['banana liqueur','creme de banane','banane du bresil','giffard banane','tempus fugit banana',
    'giffard banana','banane','98 bananas'],
  'coffee liqueur': ['coffee liqueur','kahlua','mr black','tia maria','borghetti','caffe borghetti',
    'galliano ristretto','st george nola','nola coffee','coffee liqueurs','mr black coffee','allen s coffee',
    'r and m coffee','cafe lolita','kahlua especial','cold brew liqueur','espresso liqueur'],
  'kahlua': ['kahlua','coffee liqueur','tia maria'],
  'amaretto': ['amaretto','disaronno','lazzaroni','luxardo amaretto','amaretto di saronno','adriatico',
    'gozio','bols amaretto'],
  'maraschino liqueur': ['maraschino','maraschino liqueur','luxardo maraschino','luxardo','maraska',
    'maraschino luxardo'],
  'cherry liqueur': ['cherry liqueur','maraschino','luxardo maraschino','cherry heering','heering','kirsch',
    'sangue morlacco','luxardo sangue morlacco','cherry brandy','griottines'],
  'cherry heering': ['cherry heering','heering','peter heering','heering cherry liqueur'],
  'apricot liqueur': ['apricot liqueur','apricot brandy','abricot','rothman and winter apricot',
    'rothman apricot','giffard abricot','giffard apricot','marie brizard apry','apry','abricot du roussillon'],
  'creme de cacao': ['creme de cacao','cacao liqueur','white cacao','dark cacao','tempus fugit cacao',
    'giffard cacao','marie brizard cacao','cacao','creme de cacao blanc','chocolate liqueur'],
  'chile liqueur': ['chile liqueur','chili liqueur','ancho reyes','ancho reyes verde','ancho verde','ancho',
    'ancho chile liqueur','poblano liqueur'],
  'nixta': ['nixta','nixta elote','elote liqueur','corn liqueur','licor de elote'],
  'italicus': ['italicus','rosolio di bergamotto','bergamot liqueur'],
  'pear liqueur': ['pear liqueur','poire williams','belle de brillet','mathilde poire','poire',
    'clear creek pear','spiced pear liqueur','st george spiced pear'],
  'coconut liqueur': ['coconut liqueur','kalani','koko kanu','rumhaven','coconut rum liqueur'],
  'absinthe': ['absinthe','pernod','herbsaint','la muse verte','st george absinthe','pastis','ricard',
    'vieux carre absinthe','kubler','pernod absinthe','lucid','la clandestine','absinthe superieure'],
  'pernod': ['pernod','pastis','ricard','herbsaint','anise liqueur'],
  'walnut liqueur': ['walnut liqueur','nocino','nux alpina','black walnut liqueur','noce'],
  'nocino': ['nocino','walnut liqueur','nux alpina'],
  'creme de cassis': ['cassis','creme de cassis','blackcurrant liqueur','black currant liqueur'],
  'creme de violette': ['violette','creme de violette','creme yvette','creme de yvette','rothman violette'],
  'creme de menthe': ['creme de menthe','menthe','peppermint schnapps','white creme de menthe'],
  'creme de peche': ['creme de peche','peche','peach liqueur','giffard peche'],
  'peach liqueur': ['peach liqueur','creme de peche','giffard peche','mathilde peche','peach schnapps'],
  'limoncello': ['limoncello','lemoncello'],
  'midori': ['midori','melon liqueur'],
  'frangelico': ['frangelico','hazelnut liqueur'],
  'sambuca': ['sambuca','molinari'],
  'ginger liqueur': ['ginger liqueur','domaine de canton','canton','kings ginger','giffard ginger'],
  'hibiscus liqueur': ['hibiscus liqueur','fiero hibiscus'],
  'raspberry liqueur': ['raspberry liqueur','chambord','framboise','creme de framboise'],
  'passion fruit liqueur': ['passion fruit liqueur','passionfruit liqueur','passoa','giffard passion'],
  'lychee liqueur': ['lychee liqueur','litchi liqueur','soho lychee','giffard litchi','litchi'],
  'mango liqueur': ['mango liqueur','giffard mango','mango liquor'],
  'pineapple liqueur': ['pineapple liqueur','giffard pineapple','caribbean pineapple','pineapple de mon reve'],
  'grapefruit liqueur': ['grapefruit liqueur','pamplemousse','giffard pamplemousse','creme de pamplemousse'],
  'cranberry liqueur': ['cranberry liqueur'],
  'macadamia liqueur': ['macadamia liqueur','macadamia nut liqueur'],
  'baileys': ['baileys','irish cream','irish cream liqueur'],

  /* Bitters and seasoning */
  'angostura bitters': ['angostura bitters','angostura','ango','aromatic bitters','angostura aromatic bitters',
    'aromatic','house aromatic bitters'],
  'orange bitters': ['orange bitters','regans','regans orange','regans no 6','angostura orange',
    'angostura orange bitters','fee brothers orange','bitter truth orange','orange bitter'],
  'peychauds bitters': ['peychauds','peychaud','peychauds bitters','peychaud bitters','creole bitters'],
  'chocolate bitters': ['chocolate bitters','bittermens xocolatl','xocolatl','cacao bitters','cocoa bitters',
    'fee brothers aztec chocolate','aztec chocolate'],
  'mole bitters': ['mole bitters','xocolatl mole','bittermens mole','mole'],
  'cacao bitters': ['cacao bitters','chocolate bitters','cocoa bitters'],
  'cocoa bitters': ['cocoa bitters','chocolate bitters','cacao bitters'],
  'tiki bitters': ['tiki bitters','elemakule','elemakule tiki','bittermens tiki','tiki'],
  'cardamom bitters': ['cardamom bitters','scrappys cardamom','cardamon bitters'],
  'celery bitters': ['celery bitters','bitter truth celery','scrappys celery','celery'],
  'black walnut bitters': ['black walnut bitters','walnut bitters','fee brothers black walnut','black walnut'],
  'grapefruit bitters': ['grapefruit bitters','scrappys grapefruit','bittermens hopped grapefruit'],
  'firewater bitters': ['firewater','firewater bitters','scrappys firewater'],
  'hellfire bitters': ['hellfire','hellfire bitters','hellfire habanero','bittermens hellfire',
    'hellfire habanero shrub'],
  'habanero tincture': ['habanero tincture','habanero','hellfire','habanero bitters'],
  'chile bitters': ['chile bitters','chili bitters','hellfire','firewater'],
  'pimento bitters': ['pimento bitters','allspice bitters'],
  'saline solution': ['saline solution','saline','salt solution','salt water','20 saline','salt tincture'],
  'pinch of salt': ['salt','pinch of salt','pinch salt','sea salt','kosher salt','flaky salt'],
  'orange flower water': ['orange flower water','orange blossom water','orange flower','orange blossom'],
  'rose water': ['rose water','rosewater'],
  'tabasco sauce': ['tabasco','hot sauce','tabasco sauce'],
  'vanilla extract': ['vanilla extract','vanilla','vanilla essence'],
  'almond extract': ['almond extract','almond essence'],
  'olive brine': ['olive brine','brine','olive juice'],

  /* Acids */
  'lime juice': ['lime juice','fresh lime','lime','fresh lime juice','key lime'],
  'lemon juice': ['lemon juice','fresh lemon','lemon','fresh lemon juice','meyer lemon'],
  'grapefruit juice': ['grapefruit juice','grapefruit','pink grapefruit','ruby red'],
  'white grapefruit juice': ['white grapefruit juice','white grapefruit','grapefruit juice','grapefruit'],
  'espresso': ['espresso','fresh espresso','espresso shot','shot of espresso','ristretto'],
  'cold brew coffee': ['cold brew','cold brew coffee','cold brew concentrate','coffee concentrate'],
  'dons mix': ['dons mix','donns mix','dons mix no 1'],

  /* Sweeteners */
  'simple syrup': ['simple syrup','simple','rich simple','rich simple syrup','sugar syrup','1 1 syrup',
    '1 1 simple','2 1 simple','2 1 syrup','white sugar syrup','cane sugar syrup','gomme','gum syrup'],
  'orgeat': ['orgeat','almond syrup','orgeat syrup','small hand orgeat','bg reynolds orgeat','liber orgeat',
    'giffard orgeat','latitude 29 orgeat','latitude 29'],
  'grenadine': ['grenadine','pomegranate syrup','liber grenadine','small hand grenadine','pomegranate molasses syrup'],
  'demerara syrup': ['demerara syrup','demerara','rich demerara','2 1 demerara','turbinado syrup',
    'raw sugar syrup','brown sugar syrup','rich demerara syrup','muscovado syrup'],
  'honey syrup': ['honey syrup','honey','honey water','1 1 honey','2 1 honey','rich honey','honey mix'],
  'agave syrup': ['agave syrup','agave nectar','agave','agave honey','light agave'],
  'maple syrup': ['maple syrup','maple','grade a maple','grade b maple','dark maple'],
  'cinnamon syrup': ['cinnamon syrup','cinnamon','cinnamon bark syrup','cinnamon simple'],
  'ginger syrup': ['ginger syrup','ginger','rich ginger','ginger honey','ginger simple'],
  'vanilla syrup': ['vanilla syrup','vanilla','vanilla simple','vanilla bean syrup'],
  'passion fruit syrup': ['passion fruit syrup','passionfruit syrup','passion fruit','passionfruit',
    'passion fruit puree','passion fruit nectar','passion syrup','passoa'],
  'coconut cream syrup': ['coconut cream syrup','cream of coconut','coconut cream','coco lopez','coco real',
    'coco reàl','coconut syrup'],
  'coconut cream': ['coconut cream','cream of coconut','coco lopez','coco real'],
  'tamarind syrup': ['tamarind syrup','tamarind','tamarind cordial','tamarind puree'],
  'pineapple gum syrup': ['pineapple gum syrup','pineapple gum','pineapple syrup','pineapple gomme'],
  'cane syrup': ['cane syrup','petite canne','sirop de canne','cane sugar syrup','cane'],
  'gum syrup': ['gum syrup','gomme','gomme syrup'],
  'fassionola': ['fassionola','cocktail and sons fassionola'],
  'lemon lavender syrup': ['lemon lavender syrup','lemon lavender cordial','lavender cordial','lavender syrup',
    'lemon lavender'],
  'sugar': ['sugar','white sugar','superfine sugar','caster sugar','granulated sugar','bar sugar'],
  'sugar cube': ['sugar cube','sugar cubes','sugar lump'],
  'demerara sugar': ['demerara sugar','turbinado sugar','raw sugar'],
  'brown sugar': ['brown sugar','dark brown sugar','light brown sugar'],
  'molasses': ['molasses','blackstrap molasses'],

  /* Top / mix */
  'club soda': ['club soda','soda water','soda','sparkling water','seltzer','topo chico','carbonated water',
    'mineral water','fizzy water'],
  'soda water': ['soda water','club soda','soda','sparkling water','seltzer'],
  'ginger beer': ['ginger beer','fever tree ginger beer','goslings ginger beer','q ginger beer',
    'bundaberg ginger beer','ginger ale'],
  'tonic water': ['tonic','tonic water','fever tree tonic','indian tonic','q tonic'],
  'beer': ['beer','lager','pilsner','pils','mexican lager','modelo','tecate','corona','pacifico','stout',
    'pale ale','hefeweizen','wheat beer','sour beer','porter','amber ale'],
  'cola': ['cola','coke','coca cola','mexican coke','pepsi'],
  'coconut water': ['coconut water'],
  'lemon soda': ['lemon soda','san pellegrino limonata','limonata','lemon lime soda','sprite','7up'],
  'grapefruit soda': ['grapefruit soda','squirt','jarritos grapefruit','ting','fresca'],
  'topo chico': ['topo chico','mineral water','sparkling mineral water'],
  'half and half': ['half and half','half n half','half half'],
  'whole milk': ['whole milk','milk'],
  'heavy cream': ['heavy cream','cream','double cream','whipping cream','heavy whipping cream'],
  'hot water': ['hot water','boiling water'],

  /* Egg and dairy */
  'egg white': ['egg white','egg whites','aquafaba','white of an egg','egg'],
  'whole egg': ['whole egg','egg','1 egg']
};

/* Short forms derived from a name ("Lime Juice" -> "lime") are blocked when the NEXT
   word makes them mean something else. Explicit library terms are not blocked. */
var LIB_NEXT_BLOCK = {
  juice:   'cordial|bitters|liqueur|liqueurs|soda|seltzer|wheel|wheels|wedge|wedges|peel|peels|twist|twists|zest|leaf|leaves|slice|slices|half|halves|shell|shells|husk|rind|oil|curacao|flower|blossom|marmalade|syrup|oleo|rum|gum|vodka|gin|tequila|brandy|eau|cream|water|cider|sherbet|salt|sugar|wine|beer|preserves|jam|puree',
  syrup:   'liqueur|liqueurs|bitters|beer|ale|soda|whiskey|rum|vodka|gin|brandy|extract|stick|sticks|tincture|tea|juice|shrub|cordial|eau|schnapps|spirit|bark|leaf|leaves|wheel|peel|twist|slice|slices|pod|pods|bean|beans|liquor|puree|nectar|sugar|wine|water|milk|cream|jam|preserves|essence|salt|powder|candy',
  liqueur: 'juice|syrup|bitters|soda|wheel|wedge|peel|twist|slice|slices|zest|puree|cordial|brandy|eau|vodka|rum|gin|whiskey|tea|water|flower|blossom|marmalade|preserves|jam|leaves|leaf|extract|nectar|sugar|wine|beer|milk|cream|seltzer'
};

/* Optional per-term exceptions on explicit library terms: term -> regex of words that
   must NOT follow it. Kept small; add only for real collisions. */
var LIB_TERM_NEXT_BLOCK = {
  'lime': LIB_NEXT_BLOCK.juice, 'lemon': LIB_NEXT_BLOCK.juice, 'grapefruit': LIB_NEXT_BLOCK.juice,
  'honey': LIB_NEXT_BLOCK.syrup, 'ginger': LIB_NEXT_BLOCK.syrup, 'cinnamon': LIB_NEXT_BLOCK.syrup,
  'vanilla': 'liqueur|vodka|bitters|bean|beans|pod|pods|syrup|simple', 'demerara': 'rum|rums|sugar',
  'maple': 'bitters|liqueur|whiskey|sugar', 'agave': 'spirit|spirits|plant|nectar', 'cane': 'rum|spirit|sugar|juice',
  'simple': 'syrup', 'tamarind': LIB_NEXT_BLOCK.syrup, 'passion fruit': 'liqueur|juice|seeds',
  'passionfruit': 'liqueur|juice|seeds', 'cream': 'of|soda|liqueur|sherry|syrup', 'sugar': 'syrup|cube|cubes|rim',
  'salt': 'solution|water|rim|tincture', 'egg': 'white|whites|yolk|yolks', 'blanco': 'vermouth', 'blanc': 'vermouth',
  'rhum': 'agricole', 'cacao': 'bitters|nibs|nib|butter|powder', 'mole': 'bitters', 'celery': 'salt|stalk|seed',
  'tiki': 'bitters|mug', 'espresso': 'liqueur|beans|bean|powder|vodka', 'brine': '', 'soda': 'water|syrup',
  'aromatic': 'bitters', 'jager': 'meister', 'branca': 'menta', 'cocchi': 'rosa|torino|vermouth|di',
  'carpano': 'bianco|dry|antica', 'vida': 'tobala', 'heering': '', 'luxardo': 'amaretto|sangue|cherries|cherry|triplum|bitter',
  'irish': 'cream|coffee', 'port': 'charlotte|ellen|of'
};
/* ...and words that must not come BEFORE a term. */
var LIB_TERM_PREV_BLOCK = {
  'cream': 'coconut|irish|heavy|sour|whipped|ice', 'lime': 'kaffir|makrut', 'soda': 'club|lemon|grapefruit|guava|cream',
  'grapefruit': 'white', 'cacao': 'creme|dark|white', 'rum': 'pineapple|coconut', 'gin': 'sloe|old',
  'tonic': 'gin', 'ginger': 'honey|candied', 'honey': 'hot', 'egg': 'whole', 'sugar': 'brown|demerara|raw|turbinado',
  'scotch': 'islay|peated', 'whiskey': 'rye|irish|white', 'rye': 'white'
};

var LIB_STOP=('juice syrup bitters liqueur rum gin vodka whiskey brandy orange lime lemon sweet dry '+
 'white aged simple cream water soda club fruit passion the of and red black spiced fresh light dark '+
 'blanc bianco rouge rosso vermouth tequila mezcal wine sugar salt honey agave ginger coconut apple '+
 'cherry apricot peach banana grapefruit pineapple cranberry egg mint tea cold brew rich demerara cordial').split(' ');

/* ── Normalising ─────────────────────────────────────────────────────────── */
function libNorm_(s){
  return String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/whisky/g,'whiskey').replace(/[\u2018\u2019'`]/g,'').replace(/&/g,' and ')
    .replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}
function libRe_(alt){ return alt ? new RegExp('^(?:'+alt+')$') : null; }

/* ── Terms for one ingredient, cached per execution ──────────────────────── */
var _LIB_TERMS = {};
var _LIB_INDEX = null;
function libIndex_(){
  if(_LIB_INDEX) return _LIB_INDEX;
  _LIB_INDEX = {};
  Object.keys(ING_LIBRARY).forEach(function(k){ _LIB_INDEX[libNorm_(k)] = ING_LIBRARY[k]; });
  return _LIB_INDEX;
}
function libTerms_(ing){
  var key = libNorm_(ing);
  if(_LIB_TERMS[key]) return _LIB_TERMS[key];
  var mode = (key.match(/\b(float|rinse|mist)\b/)||[])[1] || '';
  // "Float of Islay Scotch" / "Absinthe Rinse" -> the base ingredient's terms
  var base = key.replace(/^(a\s+)?(float|rinse|mist)\s+(of\s+)?/,'').replace(/\s+(float|rinse|mist)$/,'').trim() || key;
  var seen = {}, out = [];
  function add(t, next, prev){
    t = libNorm_(t); if(!t || seen[t]) return; seen[t]=1;
    var n = next!=null ? next : LIB_TERM_NEXT_BLOCK[t], p = prev!=null ? prev : LIB_TERM_PREV_BLOCK[t];
    out.push({t:t, next:libRe_(n), prev:libRe_(p)});
  }
  [key, base].forEach(function(k){
    add(k);
    var w = k.split(' '), last = w[w.length-1], alt = null;   // singular / plural of the last word
    if(/ies$/.test(last)) alt = last.replace(/ies$/,'y');
    else if(/[^s]s$/.test(last)) alt = last.slice(0,-1);
    else if(/y$/.test(last)) alt = last.replace(/y$/,'ies');
    else if(!/s$/.test(last)) alt = last+'s';
    if(alt){ w[w.length-1]=alt; add(w.join(' ')); }
  });
  var idx = libIndex_();
  [key, base].forEach(function(k){ (idx[k]||[]).forEach(function(t){ add(t); }); });
  // derived short forms, with their next-word block
  var m = base.match(/^(.+?)\s+(juice|syrup|liqueur)$/);
  if(m && m[1].length>2 && !/^(fresh|rich|simple|the)$/.test(m[1])) add(m[1], LIB_NEXT_BLOCK[m[2]]);
  var r = {mode:mode, base:base, terms:out};
  _LIB_TERMS[key] = r;
  return r;
}

/* ── Where (if anywhere) an ingredient is mentioned in a piece of text ───────
   Returns {s, e, len} in normalised-text coordinates, or null. Earliest wins; on the
   same start the longer term wins. */
function libFindTerm_(T, term){
  var needle = ' '+term.t+' ', from = 0, i;
  while((i = T.indexOf(needle, from)) > -1){
    var ok = true;
    if(term.next){ var after = T.substring(i+needle.length).split(' ')[0]; if(after && term.next.test(after)) ok=false; }
    if(ok && term.prev){ var pw = T.substring(0, i).trim().split(' '); var before = pw[pw.length-1]; if(before && term.prev.test(before)) ok=false; }
    if(ok) return {s:i+1, e:i+needle.length-1};
    from = i+1;
  }
  return null;
}
function ingMatch_(text, ing, normText){
  var T = ' '+(normText!=null ? normText : libNorm_(text))+' ';
  var L = libTerms_(ing);
  if(L.mode && T.indexOf(' '+L.mode) < 0) return null;
  var best = null;
  for(var i=0;i<L.terms.length;i++){
    var h = libFindTerm_(T, L.terms[i]); if(!h) continue;
    h.len = h.e - h.s + (L.mode ? 5 : 0);
    if(!best || h.s < best.s || (h.s === best.s && h.len > best.len)) best = h;
  }
  if(best) return best;
  // last resort, the old rule: every word of the name, anywhere (or every distinctive one)
  var tk = L.base.split(' ').filter(String); if(!tk.length) return null;
  var pos = function(w){ var j = T.indexOf(' '+w+' '); return j<0 ? -1 : j+1; };
  var ps = tk.map(pos);
  if(ps.every(function(p){ return p>-1; })) return {s:Math.min.apply(null,ps), e:Math.min.apply(null,ps)+1, len:0.5, legacy:true};
  var d = tk.filter(function(t){ return LIB_STOP.indexOf(t)<0 && t.length>3; });
  if(d.length){ var pd = d.map(pos); if(pd.every(function(p){ return p>-1; })) return {s:Math.min.apply(null,pd), e:Math.min.apply(null,pd)+1, len:0.5, legacy:true}; }
  return null;
}

/* Which of a drink's ingredients a segment belongs to (BuildAmounts). Usually one; all
   of them on an exact tie. See "WHEN TWO INGREDIENTS CLAIM THE SAME LINE" above. */
function ingWinners_(text, ings){
  var N = libNorm_(text), hits = [];
  for(var i=0;i<ings.length;i++){ var h = ingMatch_(null, ings[i], N); if(h){ h.ing = ings[i]; hits.push(h); } }
  if(hits.length < 2) return hits.map(function(h){ return h.ing; });
  hits.sort(function(a,b){ return a.s-b.s || b.len-a.len; });
  var first = hits[0];
  var cluster = hits.filter(function(h){ return h.s <= first.e + 1; });
  var top = Math.max.apply(null, cluster.map(function(h){ return h.len; }));
  var tied = cluster.filter(function(h){ return h.len === top; });
  // same length: the NARROWER ingredient wins ("Laphroaig" -> Islay Scotch over Scotch,
  // "Barbancourt" -> Rhum Agricole over Rum), then the later word (brand, then style)
  var nt = function(h){ return libTerms_(h.ing).terms.length; };
  var narrow = Math.min.apply(null, tied.map(nt));
  tied = tied.filter(function(h){ return nt(h) === narrow; });
  var lastStart = Math.max.apply(null, tied.map(function(h){ return h.s; }));
  return tied.filter(function(h){ return h.s === lastStart; }).map(function(h){ return h.ing; });
}

/* ── Coverage check: run from the script editor, not the menu ──────────────
   Lists every ingredient in use, busiest first, with the ones that match on their own
   name only at the top -- those are the ones worth adding terms for in ING_LIBRARY.
   Shows a pop-up when run from the sheet; from the editor it goes to the execution log. */
function glossaryCoverage(){
  var ss = SpreadsheetApp.getActive(), cs = ss.getSheetByName('Cocktails');
  var ING = codexIngCols_(), last = cs.getLastRow();
  var vals = cs.getRange(2,1,last-1,cs.getLastColumn()).getValues();
  var uses = {}, cat = {};
  vals.forEach(function(r){ ING.forEach(function(g){ var v=String(r[g.idx]==null?'':r[g.idx]).trim(); if(v){ uses[v]=(uses[v]||0)+1; cat[v]=cat[v]||g.cat; } }); });
  var idx = libIndex_();
  var rows = Object.keys(uses).map(function(n){
    var L = libTerms_(n), lib = (idx[libNorm_(n)]||idx[L.base]||[]).length;
    return [n, cat[n], uses[n], lib, L.terms.length, lib ? '' : 'name only'];
  }).sort(function(a,b){ return (a[5]?0:1)-(b[5]?0:1) || b[2]-a[2]; });
  var n = rows.filter(function(r){ return r[5]; }).length;
  var intro = rows.length+' ingredients in use; '+n+' match on their own name only (listed first, busiest first). '
    +'Add terms for them in ING_LIBRARY (IngredientLibrary.gs), then Preview Build Amounts.';
  try{ bShowReport_('Ingredient library coverage', intro, ['Ingredient','Category','Drinks','Library terms','Total terms',''], rows); }
  catch(e){ Logger.log(intro+'\n'+rows.map(function(r){ return r.join(' | '); }).join('\n')); }
}