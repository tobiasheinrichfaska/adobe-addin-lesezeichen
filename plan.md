# Bug Analysis & Fix Roadmap — lesezeichen_sortierer.js

> Planning document only. No code changes until each section is approved.

---

## Bug A — `movePage` offset and direction

### Why it is NOT a bug (algorithm guarantee)

The code does:

```js
for (var k = 0; k < anzahlSeiten; k++) {
    this.movePage(vonSeite + k, aktuellerEinfuegePunkt + k - 1);
}
```

For this to work correctly, `vonSeite` must always be ≥ `aktuellerEinfuegePunkt` (i.e. the block always moves forward or stays in place). This is a structural property of the algorithm — not an accident:

- `aktuellerEinfuegePunkt` starts at 0 and only ever increases by `anzahlSeiten` after each block is placed.
- Every block placed so far has already been moved to positions `[0, aktuellerEinfuegePunkt)`.
- Each remaining block's `startPage` is updated by the offset correction loop so that it reflects the physical reality after previous insertions.
- An inductive argument shows that after the offset update, every remaining block's `startPage` is always ≥ the new `aktuellerEinfuegePunkt`.

In other words: the algorithm builds the document from left to right. Blocks that have not yet been placed can only sit at or after the current insert point, never before it. A backward move is structurally impossible given correct offset tracking.

**The `+ k` on the source index is also correct for forward moves:**
Removing `vonSeite + k` (which is always to the right of the insert point) and inserting it to the left causes pages between insert and source to shift right, and pages after source to shift left. These cancel for the remaining source pages. Verified trace:

```
Source block p5,p6,p7 → move to position 2:
k=0: movePage(5,1) → [p0 p1 p5 p2 p3 p4 p6 p7]   p6 still at 6 ✓
k=1: movePage(6,2) → [p0 p1 p5 p6 p2 p3 p4 p7]   p7 still at 7 ✓
k=2: movePage(7,3) → [p0 p1 p5 p6 p7 p2 p3 p4]   ✓
```

### The implicit assumption is hidden and fragile

The algorithm's correctness depends on forward-only moves, but nothing in the code states or enforces this. If the offset update ever contains a bug (or a future change breaks the invariant), `movePage` will silently produce wrong results.

### How to reproduce a failure (if the invariant were broken)

Build a minimal PDF:
- 6 pages, bookmarks UI order: A(p3), B(p1), C(p5) with block sizes A=2, B=2, C=2
- Manually set `arbeitsliste[1].startPage = 0` before `sortiereSeitenBloecke` runs (bypassing offset update in the console)
- This forces B to appear as a backward move (vonSeite=0 < aktuellerEinfuegePunkt=2)
- Result: B's second page will end up in the wrong position because `vonSeite + k` after k=1 points to the page that shifted down to fill B's vacated slot

### Planned options

**Option A1 — Document and rename (low effort)**

- Rename `sortiereSeitenBloecke` to `sortiereVorwaerts` or add a comment block explaining the invariant
- Add an assertion (Acrobat JS has no assert, so an `if (vonSeite < aktuellerEinfuegePunkt) { app.alert("Interner Fehler: Rückwärtsbewegung erkannt."); return []; }` guard) to surface invariant violations as explicit errors rather than silent corruption

**Option A2 — Generalize to all directions (higher effort)**

Rewrite the move loop to handle both forward and backward moves correctly. The forward case is unchanged. The backward case requires a different iteration order (last-to-first source, fixed insert target) and careful accounting for how removal shifts the insert index:

```
Backward move: vonSeite < aktuellerEinfuegePunkt
For each page from last to first (k = anzahlSeiten-1 down to 0):
  insert page at vonSeite+k after page aktuellerEinfuegePunkt-1
  (adjust insert index for the page removal before it)
```

This is a non-trivial rewrite requiring its own trace verification and test PDF.

**Recommendation:** A1 now (safety guard + comment), A2 as a separate future task.

---

## Bug B — Duplicate-page bookmarks (insertChild commented out)

### Context — DigitalerUnterlagenOrdner file format

PDFs exported by BelegTool (DigitalerUnterlagenOrdner) have a strict hierarchical structure: folder bookmarks and their first child document always start on the same page. The second bookmark pointing to that page is always exactly one level deeper and positioned immediately after its parent in the tree.

This means `bereinigeDuplikate()` correctly detects these pairs, and the current behaviour — skip the secondary in page moves, include it in the TOC at the same page as the primary, leave the tree structure unchanged — produces the correct result for BelegTool PDFs.

The commented-out `insertChild` was a planned cleanup step (re-parent secondary as a child of the primary) that is not needed for this file format and was deliberately left inactive.

### Visible symptom if you encounter it

Two TOC lines pointing to the same page number, displayed at their current tree depth rather than being nested. Not a crash, but visually redundant in other PDF formats.

### How to reproduce

- PDF with 3 pages
- Bookmark "Kapitel 1" → page 0
- Bookmark "Abschnitt 1a" → page 0 (same page, sibling in tree, not child)
- Bookmark "Kapitel 2" → page 1
- Run script → TOC shows "Kapitel 1" and "Abschnitt 1a" both with page number 1, at the same indentation

### Planned option (future only, not urgent)

When `bereinigeDuplikate` detects a duplicate, pause and ask:

```
"Lesezeichen 'Abschnitt 1a' verweist auf dieselbe Seite wie 'Kapitel 1'.
 Was soll passieren?
 [Zusammenführen: Abschnitt als Kind einhängen]   [Im TOC überspringen]   [Belassen]"
```

Only needed if non-BelegTool PDFs are processed. Defer until then.

---

## Bug C — `bm.execute()` on JavaScript-action bookmarks

### The problem

```js
function getBookmarkPage(bm) {
    var currentPage = this.pageNum;
    bm.execute();                  // navigates to bookmark target
    var targetPage = this.pageNum; // reads resulting page
    this.pageNum = currentPage;    // navigate back
    return targetPage;
}
```

`bm.execute()` fires whatever action the bookmark holds. For non-page bookmarks (JavaScript action, URL, form submit, etc.):
- `this.pageNum` does not change → wrong page recorded (returns current page, not bookmark target)
- If the action opens a dialog (`app.alert`, `app.response`), the sort is blocked mid-run waiting for user input
- Any data already modified (pages moved) cannot be undone

The correct API is `bm.pageNum`, which returns the 0-based page index for page-navigation bookmarks and `undefined` for all others — no side effects, no navigation.

### How to reproduce

1. Open any PDF in Acrobat
2. Right-click a bookmark → Properties → Actions
3. Delete the "Go to page" action; add "Run a JavaScript" → `app.alert("test");`
4. Run the script → alert fires in the middle of `befulleBeideListenRekursiv`, blocking everything. The affected bookmark records the wrong page, causing silent missorting or a crash.

### Why you haven't seen it

Your PDFs use only standard page-navigation bookmarks produced by BelegTool's pikepdf export or by Word/PDF export tools. JavaScript-action bookmarks only appear in interactive PDFs built for kiosks, forms, or programmatic automation.

### Planned fix — two choices, user decides before any PDF changes

**Step 1 (detection):** At the very start of `ausfuehrenSortierungOptimiert`, before touching the document, scan all bookmarks recursively and collect names where `bm.pageNum === undefined`.

**Step 2 (choice dialog):** If any are found, show a dialog:

```
"Folgende Lesezeichen enthalten JavaScript-Aktionen und können nicht
 nach Seiten sortiert werden:
 - Deckblatt
 - Anhang A

 Was soll passieren?
 [Alle JS aus PDF entfernen & sortieren]   [Abbrechen]"
```

- **Abbrechen:** Exit immediately. No changes to the document.
- **Alle JS entfernen:** Strip all JavaScript from the entire document before proceeding:
  - Set each JS-action bookmark to a neutral page-navigation action (`bm.setAction("this.pageNum = 0;")`)
  - Additionally clear document-level and page-level scripts via Acrobat's `this.removeScripts()` or equivalent — removes all JS from the whole PDF, not just bookmarks
  - This is intentionally broad: the user explicitly consented, and partial JS removal would leave an inconsistent document

If no JS-action bookmarks are found, proceed silently without the dialog.

**Why "kill all" rather than per-bookmark choice:**  
Partial JS removal (strip only offending bookmarks) leaves the document in a mixed state where some interactive JS still works. Offering that inconsistency as an option creates support confusion. A clear "all JS goes" choice is safer and easier to reason about.

---

## New feature — TOC with clickable links

### What it should do

Currently the TOC is drawn using read-only text fields. No click behaviour.

Desired:
1. Clicking a TOC entry (title or page number) jumps to the corresponding page in the PDF
2. Each content page has a small "↑ TOC" button/link that jumps back to the TOC

### Implementation approach

Replace the `addField` text fields with **button fields** (`"button"` type in Acrobat JS). Buttons support an `OnMouseUp` action that can execute a page-jump:

```js
// Instead of addField(..., "text", ...)
var btn = this.addField(feldName, "button", aktuelleIhvSeite, textRect);
btn.buttonSetCaption(datensatz.name);
btn.setAction("MouseUp", "this.pageNum = " + zielSeiteImPDF + ";");
btn.textSize = ...;
```

Back-link on content pages: insert a small button field on each content page that navigates back to IHV page 0:

```js
var backBtn = this.addField("BackToTOC_" + seite, "button", seite, backRect);
backBtn.buttonSetCaption("↑ TOC");
backBtn.setAction("MouseUp", "this.pageNum = 0;");
```

### Open design questions (decide before implementing)

- Should forward-links replace text fields entirely, or should text fields remain with a transparent clickable button overlaid?
- Where exactly should the back-link appear (top-right corner, bottom-center)?
- Should the back-link appear on ALL content pages, or only on first pages of each block?

---

## New feature — PDF split with cross-referenced TOC

### What it should do

Split the sorted PDF into multiple output files, each ≤ N pages. Splits always happen at a top-level TOC boundary (never mid-chapter). Each output file contains a full TOC showing all chapters, with a clear marker indicating which file holds each chapter.

Example output TOC entry:
```
3. Kapitel Drei ........... Datei 2, Seite 1
```

### Algorithm outline

**Phase 1 — Determine split points**
- Walk `arbeitsliste` (main bookmarks, in order) accumulating page count
- When cumulative count would exceed N, record a split here
- Ensure the split always falls at a block boundary (never mid-block)

**Phase 2 — Create output files**
- For each segment, call `this.extractPages(startPage, endPage)` to produce a Doc object
- Or export the full sorted PDF first and split post-sort

**Phase 3 — Inject cross-referenced TOC into each file**
- Full chapter list as before, but page numbers for chapters NOT in this file show `"→ Datei X, S. Y"` instead of a local page number
- Local chapters use normal page numbers
- Chapter entries from other files can be visually dimmed (grey text via `txtFeld.textColor = color.gray`) or use a different font

### Open design questions

- User input: how is N specified? A dialog box at the start? A fixed setting?
- Output: saved as separate PDFs in the same folder as the source? User picks a folder?
- Naming: `originalname_Teil1.pdf`, `originalname_Teil2.pdf`?
- Should cross-file TOC entries still be clickable (would need to open the other file — complex) or plain text only?
- This feature interacts with the existing BelegTool auto-split at >100 pages. Should it eventually replace that, or stay separate?

---

## Lower-priority items (no plan yet)

| # | Issue | When to address |
|---|---|---|
| D | Magic layout numbers (22, 80, 50…) | When TOC layout needs tuning |
| E | Double `var i` re-declaration | Next JS cleanup pass |
| F | Zero-length block not guarded | If stress testing shows it fires |
| G | TOC cleanup only matches exact bookmark name | If renamed TOCs cause issues |

---

*Created: 2026-05-25 — planning only, no code changes*
