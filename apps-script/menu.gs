/**
 * Cocktail Codex — Menu / onOpen  (v11)
 * v11 adds Preview Build Amounts (2 - Amounts) and Review Multi-Recipe Descriptions
 *      (5 - Maintenance), and notes in the Guide that Build Amounts now reads the
 *      description NOTES. Clear Description Notes is REMOVED: those notes are now the
 *      only copy of each original, and Build Amounts depends on them.
 * ------------------------------------
 * v10 adds Audit Amounts under Maintenance, and CORRECTS THE GUIDE: it still said
 *      Tag Families and Tag Holidays rewrite their columns and that hand edits are
 *      lost. Both are fill-blanks-only as of TagFamilies v8 / TagHolidays v2, so the
 *      warning was not just stale but backwards -- it pushed you into editing code
 *      when typing in the sheet is now the right move.
 *
 * Builds the "Cocktail Codex" ribbon as a numbered PIPELINE, grouped by stage,
 * with a built-in Guide (info) that explains what each item does and — importantly —
 * what is safe to re-run vs. what can overwrite work.
 *
 *   v2 Maintenance submenu.  v3 Add-amounts submenu.  v4 Load ingredients.
 *   v5 removed it.  v6 Add-amounts = Load / File / Reset.
 *   v7 reorganized into stages; added Classify & Tag (Families, Era) and Reports
 *      (Overlap); added the Guide dialog.
 *   v9 columns are resolved BY HEADER via COL() in Config.gs, so no column letters
 *      appear anywhere any more -- move or insert a column and the scripts follow.
 *      Added "Check Column Mapping" under Maintenance.
 *   v8 stage 3 owns every tag column, one script per column:
 *        Mood    -> tagMoods        (TagMoods.gs)
 *        Season  -> tagSeason       (TagSeason.gs)
 *        Holiday -> tagHolidays     (TagHolidays.gs)
 *        Family  -> tagFamilies     (TagFamilies.gs)
 *        Era     -> seedEraFromIBA  (TagEra.gs)
 *      Maintenance's "Auto-tag Blanks" is retired — it wrote Mood, Season AND
 *      Holiday, which collided with the dedicated taggers. All five tag columns
 *      now have exactly one owner; Maintenance is amounts-only.
 *
 * Function names must match the functions in your other files:
 *   fetchYouTubeDescriptions     (FetchYouTubeDescriptions.gs)
 *   fetchWebDescriptions / refetchClippedDescriptions (FetchWebDescriptions.gs)
 *   previewCleanDescriptions / cleanDescriptions      (CleanDescriptions.gs)
 *   buildAmountsFromDescriptions (BuildAmounts.gs)
 *   loadAllMissingAmounts / fileAmounts / setupAmountEntry (AmountEntry.gs)
 *   tagMoods                     (TagMoods.gs)
 *   tagHolidays                  (TagHolidays.gs)
 *   tagFamilies                  (TagFamilies.gs)
 *   seedEraFromIBA               (TagEra.gs)
 *   overlapReport                (OverlapReport.gs)
 *   tagSeason                    (TagSeason.gs)
 *   normalizeAmounts             (CodexMaintenance.gs)
 *   auditAmounts                 (AuditAmounts.gs)
 *   previewBuildAmounts          (BuildAmounts.gs)
 *   auditMultiRecipeDescriptions (DescriptionSplitAudit.gs, needs RecipeBlocks.gs)
 *   highlightOrphans / clearOrphanHighlights  (AuditAmounts.gs)
 *   publishCodexData             (PublishCodex.gs)
 */
function onOpen(){
  var ui=SpreadsheetApp.getUi();
  ui.createMenu('Cocktail Codex')
    .addItem('Guide — what runs when', 'showCodexGuide')
    .addSeparator()

    .addSubMenu(ui.createMenu('1 - Descriptions')
      .addItem('Fetch YouTube Descriptions', 'fetchYouTubeDescriptions')
      .addItem('Fetch Web Descriptions', 'fetchWebDescriptions')
      .addItem('Re-fetch Clipped Descriptions', 'refetchClippedDescriptions')
      .addSeparator()
      .addItem('Preview Clean Descriptions', 'previewCleanDescriptions')
      .addItem('Clean Descriptions (to Recipe Text column)', 'cleanDescriptions')
      .addItem('Clean Descriptions In Place (original kept in a note)', 'cleanDescriptionsInPlace')
      .addSeparator()
      .addItem('Restore Descriptions From Notes', 'restoreDescriptionsFromNotes'))

    .addSubMenu(ui.createMenu('2 - Amounts')
      .addItem('Preview Build Amounts (writes nothing to RC)', 'previewBuildAmounts')
      .addItem('Build Amounts (From Descriptions)', 'buildAmountsFromDescriptions')
      .addItem('Load Amounts (All Missing Amounts to Add)', 'loadAllMissingAmounts')
      .addItem('File Amounts (File All Amounts Added)', 'fileAmounts')
      .addSeparator() 
      .addItem('Normalize Amounts (convert + snap)', 'normalizeAmounts')
     .addSeparator()
      .addItem('Reset Entry Sheet', 'setupAmountEntry'))

    .addSubMenu(ui.createMenu('3 - Classify & Tag')
      .addItem('Tag Moods — fills blanks', 'tagMoods')
      .addItem('Tag Season — fills blanks', 'tagSeason')
      .addSeparator()
      .addItem('Tag Holidays', 'tagHolidays')
      .addItem('Tag Families', 'tagFamilies')
      .addSeparator()
      .addItem('Tag Era from IBA', 'seedEraFromIBA'))


    .addSubMenu(ui.createMenu('4 - Reports')
      .addItem('Composition Overlap Report', 'overlapReport'))

    .addSubMenu(ui.createMenu('5 - Maintenance')
      .addItem('Check Column Mapping', 'codexCheckColumns')
      .addItem('Audit Amounts', 'auditAmounts')
      .addItem('Review Multi-Recipe Descriptions', 'auditMultiRecipeDescriptions')
      .addSeparator()
      .addItem('Repair Orphan Keys', 'repairOrphans')
      .addItem('Highlight Orphan Rows', 'highlightOrphans')
      .addItem('Clear Orphan Highlights', 'clearOrphanHighlights'))

    .addSeparator()
    .addItem('Publish Codex to GitHub', 'publishCodexData')
    .addToUi();
}

/**
 * Plain-language guide so you never have to guess. Grouped like the menu, with the
 * safe-to-re-run notes called out.
 */
function showCodexGuide(){
  var ui=SpreadsheetApp.getUi();
  var msg =
  'TYPICAL ORDER:  1 -> 2 -> (3, 4, 5 as needed) -> Publish\n\n' +

  '1 - DESCRIPTIONS  — pulls recipe text into the description column.\n' +
  '   * Fetch YouTube / Web — fill BLANK rows from the source link.\n' +
  '   * Re-fetch Clipped — repairs old truncated entries (Shopify/Liber & Co pages\n' +
  '     capped og:description at ~320 chars, which dropped amounts). Overwrites ONLY\n' +
  '     rows with that clipped signature, then run Build Amounts to map what it\n' +
  '     recovered. Safe: it will not replace a good multi-line description.\n' +
  '   * Preview Clean Descriptions — writes NOTHING. Logs ten before/after samples so\n' +
  '     you can see what the cleaner would keep before letting it run.\n' +
  '   * Clean Descriptions — strips a YouTube description down to the recipe and puts\n' +
  '     the result in a separate "Recipe Text" column. YT_Description is NEVER touched.\n' +
  '     It does not look for boilerplate, because every creator writes different\n' +
  '     filler; a line survives only if it holds a measurement or an ingredient THIS\n' +
  '     drink actually has. Typical result is 1,750 characters down to about 200.\n' +
  '     Add a "Recipe Text" column to Cocktails first — it is found by header, so the\n' +
  '     position does not matter. Descriptions yielding nothing are left alone and\n' +
  '     counted in the summary.\n\n' +

  '2 - AMOUNTS\n' +
  '   * Preview Build Amounts — runs the same parse as Build Amounts but writes only a\n' +
  '     "Build Preview" tab (every auto amount that would change, appear or vanish) and\n' +
  '     the "Build Log". Nothing in the AmountIndex is touched. Run it before a build.\n' +
  '   * Build Amounts From Descriptions — parses those descriptions into the AmountIndex.\n' +
  '     It reads the ORIGINAL description from the cell note when there is one, and\n' +
  '     parses only the drink\'s own recipe block. If it cannot tell which block is the\n' +
  '     drink\'s, it writes NO amounts for that drink and says why in "Build Log".\n' +
  '     SAFE: rewrites only AUTO rows. Any row with Source = "manual" is kept\n' +
  '     untouched, so hand-corrections are never overwritten by a rebuild.\n' +
  '   * Load All Missing Amounts — stages every ingredient still missing an amount\n' +
  '     onto the "Add Amount" tab to fill.\n' +
  '   * File Amounts — commits those back to the AmountIndex (as manual rows).\n' +
  '     Reset Entry Sheet — clears the staging tab.\n\n' +

  '3 - CLASSIFY & TAG   (one script per column — no two scripts share a column)\n' +
  '   ALL FIVE NOW FILL BLANKS ONLY. THE SHEET WINS. Type a value into any tag\n' +
  '   column and no script will ever take it back. Their job is the FIRST PASS:\n' +
  '   add drinks, run them, review what they guessed at, correct it in the sheet.\n' +
  '   To re-tag a row, clear the cell and re-run.\n' +
  '   * Tag Families — structural family from ingredients, style and serve.\n' +
  '     Most rules need only ingredient NAMES, not amounts — only the equal-parts\n' +
  '     formula families (Last Word, Naked & Famous, Paper Plane) and the\n' +
  '     Negroni/Manhattan ratio tie-break read the AmountIndex.\n' +
  '     FAM_OVERRIDE still applies to BLANK cells, so it is the place for an\n' +
  '     arbitration you want applied to future rebuilds — not for a one-off fix,\n' +
  '     which is now just typing in the sheet.\n' +
  '   * Tag Holidays — curated lists in HOL_MEMBERS plus the Irish-whiskey rule\n' +
  '     for St. Patrick\'s. Add a drink by putting its name in the right list, or\n' +
  '     just type the holiday into the cell. It reports any curated name it cannot\n' +
  '     find in the sheet, so a typo shows up instead of silently dropping a drink.\n' +
  '   * Both report DISAGREEMENTS without acting on them: where a populated cell\n' +
  '     differs from what the rules would now produce, the run logs it so you can\n' +
  '     see where your judgement and the rules have drifted apart.\n' +
  '   * Tag Moods — SAFE: fills only BLANK Mood cells and keeps yours. To\n' +
  '     force a value use MOOD_OVERRIDE; to recompute everything from scratch set\n' +
  '     MOOD_REBUILD_ALL = true (that one DOES overwrite your hand entries).\n' +
  '   * Seed Era from IBA — SAFE: only fills BLANK Era cells.\n' +
  '   * Tag Season — SAFE: fills only blank Season cells.\n\n' +

  '   NOTE: the old "Auto-tag Blank Mood/Season/Holiday" is gone. It wrote three\n' +
  '   columns at once, which now fights Tag Moods and Tag Holidays for ownership.\n' +
  '   Its Mood logic is now TagMoods.gs and its Season logic TagSeason.gs.\n\n' +

  '4 - REPORTS\n' +
  '   * Composition Overlap — read-only; writes an "Overlap Report" tab of drinks\n' +
  '     with the same or nearly-the-same ingredient set. Touches no data.\n\n' +

  '5 - MAINTENANCE\n' +
  '   * Highlight Orphan Rows — the only thing in this project that paints a data\n' +
  '     sheet, which is why it is a separate action rather than part of the audit.\n' +
  '     Shades every row in the AmountIndex whose key matches no ingredient cell, so\n' +
  '     you can see them in place. Clear Orphan Highlights removes the shading.\n' +
  '     An orphan publishes as NO AMOUNT: the key is what PublishCodex looks the\n' +
  '     amount up by, so a renamed drink or a stray space silently breaks the link.\n' +
  '   * Review Multi-Recipe Descriptions — read-only. Finds descriptions holding several\n' +
  '     recipes and checks each drink\'s published amounts against its OWN recipe block;\n' +
  '     results and suggested fixes on a "Desc Review" tab.\n' +
  '   * Audit Amounts — read-only. Flags amounts that look wrong and writes an\n' +
  '     "Amount Audit" tab with a link straight to each offending cell, so you are\n' +
  '     not hunting through 3,000 rows. Thresholds are LEARNED each run: it takes\n' +
  '     the 5th-95th percentile per category from your own data and flags well\n' +
  '     outside that, so they stay current as the collection grows. Also catches\n' +
  '     duplicates and missing amounts. It never edits anything.\n' +
  '     Note: the parser rows are not where the errors are — barely any of the ~98\n' +
  '     AUTO rows flag. The parser only wrote a row when it was confident, and\n' +
  '     anything it got wrong you already fixed, which made it manual.\n' +
  '   * Normalize Amounts (listed under 2 - Amounts) — converts ml/cl/tbsp/parts to\n' +
  '     fl oz and snaps to clean eighths and thirds. Leaves tsp, barspoon, dashes\n' +
  '     and drops in their units.\n' +
  '   * Check Column Mapping — read-only. Every script now finds its columns BY\n' +
  '     HEADER NAME, not by position, so you can insert or move columns in\n' +
  '     Cocktails freely. This lists where each field resolved. Run it after any\n' +
  '     column change: if something looks wrong you see it in seconds instead of\n' +
  '     finding bad data three runs later. To add an ingredient column, create it\n' +
  '     in the sheet and add its header to CODEX_ING_GROUPS in Config.gs — the\n' +
  '     position in that list sets the order on the recipe card.\n\n' +

  'PUBLISH — rebuilds codexdata.js from the sheet and pushes it to GitHub for the\n' +
  'web app. Run after any change you want live. (Data only; safe to run often.)\n\n' +

  'WHICH ONES CAN LOSE MY WORK?\n' +
  '   None of stage 3 any more — all five tag scripts fill blanks only, so anything\n' +
  '   you type into a tag column survives every re-run.\n' +
  '   Still worth knowing:\n' +
  '   * MOOD_REBUILD_ALL = true in TagMoods.gs DOES overwrite hand entries.\n' +
  '   * Build Amounts rewrites AUTO rows. Manual rows are always preserved, and\n' +
  '     anything filed through Add Amount is manual, so in practice this is safe.\n' +
  '   * Clearing an Amount hands that row back to the parser — that is how you ask\n' +
  '     for it to be rebuilt.\n' +
  '   * Re-fetch Clipped Descriptions overwrites descriptions with the clipped\n' +
  '     signature, by design.';

  ui.alert('Cocktail Codex — Guide', msg, ui.ButtonSet.OK);
}