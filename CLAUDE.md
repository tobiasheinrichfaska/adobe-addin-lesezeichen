# CLAUDE.md — Adobe Add In - Lesezeichen

> Part of the `c:\skripte` workspace. See [general stuff/CLAUDE.md](../general%20stuff/CLAUDE.md) for workspace-wide conventions.

---

## Project overview

An **Adobe Acrobat JavaScript Add-in** (single file: `lesezeichen_sortierer.js`) that:

1. Reads all bookmarks from the open PDF
2. Sorts the physical PDF pages to match the bookmark order
3. Removes any existing "Automatisches Inhaltsverzeichnis" (+ its PDF pages)
4. Inserts a freshly generated table-of-contents at the front, with text fields for title and page number per entry
5. Registers a menu item under **View → PDF nach Lesezeichen sortieren**

## Installation

Paste the script into Adobe Acrobat's **JavaScript console** (Ctrl+J) or install it as a folder-level script:
`%APPDATA%\Adobe\Acrobat\<version>\JavaScripts\lesezeichen_sortierer.js`

After restart the menu item appears under **View**.

## Technology

- **Language:** Adobe Acrobat JavaScript (based on ES3/ECMA-262; Acrobat JS API)
- **Key Acrobat APIs used:**
  - `app.trustedFunction` / `app.beginPriv` / `app.endPriv` — elevated privileges for page manipulation
  - `this.bookmarkRoot` — bookmark tree traversal
  - `bm.execute()` / `this.pageNum` — resolve bookmark target page
  - `this.movePage()` / `this.newPage()` / `this.deletePages()` — physical page manipulation
  - `this.addField()` — draw text fields for the TOC
  - `app.addMenuItem()` — register menu entry
- **No build step, no dependencies**

## Architecture — call graph

```
ausfuehrenSortierungOptimiert()   ← trusted entry point, menu-triggered
  befulleBeideListenRekursiv()    ← populates uiListe + arbeitsliste
  arbeitsliste.sort()             ← sort by page number
  bereinigeDuplikate()            ← mark secondary bookmarks on same page
  berechneBlockLaengen()          ← compute page-block sizes
  loescheInhaltsverzeichnisUndBerechneOffset()  ← delete old TOC pages + adjust offsets
  berechneBlockLaengen()          ← recompute after deletion
  sortiereSeitenBloecke()         ← physically reorder pages; returns TOC print data
  [draw TOC text fields]          ← render TOC via addField()
```

## Versioning

No version number yet — first release. Next release should add `v1.0.0` as a comment header.

## Known issues / open items

- The offset recalculation in `sortiereSeitenBloecke()` uses a position-based heuristic (`uiPosition`) that can misfire when bookmarks are deeply nested or out of order in complex documents — needs stress-testing.
- Secondary (duplicate-page) bookmarks are **detected but not moved** as children in the final output (the `insertChild` call is commented out in `bereinigeDuplikate()`).
- No undo support — Acrobat's undo stack is cleared after `app.beginPriv` operations.
- The "Automatisches Inhaltsverzeichnis" detection is case-insensitive name matching; a renamed TOC won't be cleaned up.

## GitHub

https://github.com/tobiasheinrichfaska/adobe-addin-lesezeichen

---

*Last updated: 2026-05-25*
