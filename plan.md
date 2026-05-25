# Bug Analysis & Fix Roadmap — lesezeichen_sortierer.js

> Planning document only. No code changes until each section is approved.

---

## Bug A — `movePage` breaks on multi-page blocks that move backward

### What the code does

```js
for (var k = 0; k < anzahlSeiten; k++) {
    this.movePage(vonSeite + k, aktuellerEinfuegePunkt + k - 1);
}
```

`movePage(nPage, nAfter)` removes the page at index `nPage` and re-inserts it after index `nAfter`.

The loop is supposed to move an entire block of `anzahlSeiten` pages from `vonSeite` to `aktuellerEinfuegePunkt`.

### Why it works for forward moves (vonSeite > aktuellerEinfuegePunkt)

When a block moves forward, the insert point is to the LEFT of the source block. After removing `vonSeite + k` and inserting it left of the source:
- Pages after the insertion point and before `vonSeite + k` shift right by 1
- Pages after `vonSeite + k` shift left by 1
- The two shifts cancel for the remaining source pages (indices `vonSeite + k + 1` and beyond)
- So `vonSeite + k` for the next iteration still points to the correct next source page ✓

Verified trace (vonSeite=5, insert=2, 3 pages):

```
Start: [p0 p1 p2 p3 p4 | p5 p6 p7 | p8]
k=0: movePage(5, 1) → [p0 p1 p5 p2 p3 p4 p6 p7 p8]   p6 still at 6 ✓
k=1: movePage(6, 2) → [p0 p1 p5 p6 p2 p3 p4 p7 p8]   p7 still at 7 ✓
k=2: movePage(7, 3) → [p0 p1 p5 p6 p7 p2 p3 p4 p8]   ✓
```

### Why it breaks for backward moves (vonSeite < aktuellerEinfuegePunkt)

When a block moves backward, the insert point is to the RIGHT of the source block. Removing `vonSeite` shifts all pages to its right LEFT by 1 — including the remaining pages of the source block.

After k=0, the next source page was at `vonSeite + 1` but it has shifted down to `vonSeite`. The code then reads `vonSeite + 1`, which now points to the page AFTER the block — a wrong source page.

Verified trace (vonSeite=2, insert=6, 3 pages):

```
Start: [p0 p1 | p2 p3 p4 | p5 p6 p7]
k=0: remove p2, insert after idx 5 → [p0 p1 p3 p4 p5 p6 p2 p7]
     p3 is now at index 2, but next iteration uses vonSeite+1=3 → reads p4 ✗
k=1: movePage(3, 6) → moves p4, not p3. p3 is now orphaned between its
     neighbours, p2 and p4 are together at the end but p3 is left behind.
```

### Why you haven't seen this

Two conditions must both be true:
1. **A block must move backward** — a bookmark that appears LATER in the bookmark panel must currently sit on a page that is EARLIER in the PDF. In a document where pages were added or scanned in rough bookmark order this never happens.
2. **The block must be more than one page long** — when `anzahlSeiten = 1`, k only ever equals 0, so there is no second iteration and the offset error never occurs.

In practice, PDFs built systematically chapter-by-chapter will always have forward-moving or same-position blocks. A document where this triggers would be, e.g., a legal brief whose appendices come first physically but last in the bookmark hierarchy, each appendix being ≥ 2 pages.

### How to reproduce

Build a minimal test PDF:
- 6 pages total, blank content
- Bookmark A → page 4 (0-based index 3), 2 pages long
- Bookmark B → page 1 (0-based index 0), 2 pages long
- Bookmark C → page 6 (index 5), 1 page long

Bookmark panel order: A, B, C (so B should sort before A).
Running the script requires block B (physical pages 1–2) to move backward to position 0 while block A (physical pages 3–4) moves forward. After sorting, pages should be ordered B1, B2, A1, A2, C. With the bug, A1 or A2 will appear in the wrong order.

---

## Bug B — Secondary bookmarks silently dropped (insertChild commented out)

### What the code does

`bereinigeDuplikate()` finds bookmarks that point to the same page as an earlier bookmark and marks them `istHauptLesezeichen = false`. The original intent was:

```js
hauptEintrag.bookmark.insertChild(eintrag.bookmark, hauptEintrag.childCount);
```

This line is **commented out**. `childCount` is incremented anyway.

### What happens without it

In `sortiereSeitenBloecke()`, secondary bookmarks hit the `continue` branch (line 311–323). They ARE written to `ihvDruckDaten` (TOC output) using `letzteGueltigeHauptSeite` as their page — correct so far. But:

- Their physical pages are never moved separately (fine — those pages belong to the primary's block and move with it)
- Their position in the bookmark tree is unchanged — they are NOT re-parented under the primary
- If the secondary bookmark has its own children, those children are also not reparented

The visible result is: in the bookmark panel the secondary stays at its original level; in the generated TOC both primary and secondary appear side by side at the same page number.

### Why you haven't seen this

Requires two or more bookmarks pointing to **exactly the same page number**. This is unusual in well-structured documents. Common cause: two chapter headings were placed on the same scan page, or a sub-section was bookmarked at the same page as its parent. If your test PDFs all have one bookmark per page, this code path is never reached.

### How to reproduce

- PDF with 4 pages
- Bookmark "Kapitel 1" → page 1
- Bookmark "Abschnitt 1a" → also page 1 (same page, different bookmark)
- Bookmark "Kapitel 2" → page 2

Run the script. Both "Kapitel 1" and "Abschnitt 1a" appear in the TOC pointing to the same page. In the bookmark panel they remain siblings rather than "Abschnitt 1a" being nested under "Kapitel 1".
Whether this is a bug or just "incomplete feature" depends on intended behaviour.

---

## Bug C — `bm.execute()` breaks on JavaScript-action bookmarks

### What the code does

```js
function getBookmarkPage(bm) {
    var currentPage = this.pageNum;
    bm.execute();                  // navigates the viewer to the bookmark target
    var targetPage = this.pageNum; // reads where we landed
    this.pageNum = currentPage;    // navigate back
    return targetPage;
}
```

### The problem

Bookmarks in Acrobat can hold any action, not just page navigation. Common non-page actions:
- `app.alert("…")` — dialog
- Calling a named JavaScript function
- Opening a URL or attachment
- Submitting form data

When `bm.execute()` triggers a JavaScript action, `this.pageNum` does not change (no navigation happened), so `getBookmarkPage` returns the current page — silently wrong. If the JS action opens a dialog, the entire sort is blocked waiting for user input mid-run.

### The correct API

Acrobat's Bookmark object exposes `bm.pageNum` directly:
- Returns the 0-based page index for a page-navigation action
- Returns `undefined` (or `-1` depending on Acrobat version) for non-page actions

Using `bm.pageNum` eliminates the navigation side-effect and makes non-page bookmarks detectable without executing them.

### Why you haven't seen this

Your PDFs likely use only standard page-navigation bookmarks created by Acrobat or Word/PDF export tools. Manual JavaScript-action bookmarks are rare in everyday documents. They appear in interactive PDFs, forms, and documents built programmatically for kiosk/presentation use.

### How to reproduce

1. Open a PDF in Acrobat
2. Right-click a bookmark → Properties → Actions tab
3. Add action: "Run a JavaScript" → `app.alert("test");`
4. Remove the default "Go to a page in this document" action, leaving only the JS action
5. Run the script → the alert fires mid-run, blocking execution; the sort result for this bookmark's page will be wrong (recorded as whatever page was current at the time of execution)

---

## Planned fix for Bug C — two options

### Option A: Abort if JS-action bookmarks are detected (conservative)

Before the sort begins, scan every bookmark recursively. For any bookmark where `bm.pageNum === undefined`, collect its name. If any are found, show an alert listing them and stop:

```
"Folgende Lesezeichen haben JavaScript-Aktionen und können nicht
 sortiert werden. Bitte entfernen Sie die JS-Aktion oder ändern
 Sie sie auf eine Seitennavigation:
 - Name des Lesezeichens 1
 - Name des Lesezeichens 2"
```

No data is modified. User must fix bookmarks manually before running again.

**Pros:** Simple, safe, no data loss.  
**Cons:** If the user has one unrelated JS bookmark in a 200-bookmark document, the entire sort is blocked.

### Option B: Offer to strip JS actions and proceed (power option)

After detecting JS-action bookmarks, present a choice:

```
"3 Lesezeichen haben JavaScript-Aktionen (keine Seitenziele):
 - Deckblatt
 - Anhang A
 - Impressum

 Was soll passieren?
 [Nur diese überspringen]   [JS-Aktionen entfernen & sortieren]   [Abbrechen]"
```

- **Nur diese überspringen**: exclude JS-action bookmarks from sort and TOC; leave their actions and tree position unchanged.
- **JS-Aktionen entfernen**: call `bm.setAction("this.pageNum = 0;")` on each offending bookmark to replace the JS action with a neutral page-navigation action (page 0). Bookmark is now page-sortable but its original JS functionality is permanently lost.
- **Abbrechen**: do nothing.

**Pros:** Flexible, handles edge cases without blocking the entire workflow.  
**Cons:** More UI complexity; the "entfernen" path is destructive (irreversible without undo, which doesn't work after `beginPriv` anyway).

### Recommendation

Implement Option B. The "überspringen" path is the default safe choice; "entfernen" is explicitly opt-in and destructive. This matches how Acrobat Pro itself handles similar conflicts (warn + choice, never silent data loss).

### Implementation steps (not yet approved)

1. Extract `bm.execute()` → `bm.pageNum` replacement in `getBookmarkPage()`
2. Add `sammelJsLesezeichen(root)` — recursive scan returning array of bookmark names where `bm.pageNum === undefined`
3. At the top of `ausfuehrenSortierungOptimiert()`, call scan; if result is non-empty, show `app.response()` dialog with the three choices
4. Thread choice through: skip-list passed to `befulleBeideListenRekursiv`, or strip loop before it runs
5. Update `befulleBeideListenRekursiv` to accept an optional skip-set

---

## Other bugs (lower priority, no fix planned yet)

| # | Summary | Fix when |
|---|---|---|
| D | Magic layout numbers (22, 80, 50…) | When TOC layout needs tuning |
| E | Double `var i` in loop | With next JS cleanup pass |
| F | No guard for zero-length blocks | When stress-testing confirms it fires |
| G | TOC name match ("automatisches inhaltsverzeichnis") is fragile | If renamed TOC causes issues |

---

*Created: 2026-05-25 — planning only, no code changes*
