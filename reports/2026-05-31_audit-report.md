# Audit Report — Adobe Add In - Lesezeichen

**Date:** 2026-05-31
**Project:** `c:\skripte\public\Adobe Add In - Lesezeichen`
**Auditor:** Opus audit agent
**Scope:** `lesezeichen_sortierer.js` (single-file Adobe Acrobat JS add-in) + repo metadata

---

## Pre-flight checks

| Check | Result | Note |
|-------|--------|------|
| Build | N/A | Adobe Acrobat JS add-in — no build step (documented). |
| Lint | N/A | No lint config; Acrobat ES3 engine, standard linters do not apply (see CLAUDE.md `this`-context note). |
| Tests | N/A | No test suite present; cannot run in CI (requires Acrobat host + a PDF). |
| Web load | N/A | Not a web app. |
| FEATURES_REQUIRED.md | MISSING | No critical-user-path file at project root or `/docs/`. |

Build/lint/test tooling is legitimately absent for this project type. The runtime can only be exercised inside Adobe Acrobat with a target PDF, so dynamic validation was not possible in this environment.

---

## Findings

| # | Category | Severity | Finding | Location | Suggestion |
|---|----------|----------|---------|----------|------------|
| 1 | Correctness | High | `getBookmarkPage` uses `bm.execute()` to resolve the target page. For bookmarks whose action is not "go to page" (JavaScript/URL/submit), `this.pageNum` does not change → the wrong page is recorded, and a JS-action bookmark can fire `app.alert`/`app.response` mid-run, blocking the script after pages were already moved (no undo). | `lesezeichen_sortierer.js:21-27` | Use `bm.pageNum` (0-based index, `undefined` for non-page bookmarks) instead of `execute()`. Already documented as Bug C in `plan.md`. |
| 2 | Correctness | High | The `movePage` loop relies on an unstated, unenforced invariant (`vonSeite >= aktuellerEinfuegePunkt`, forward-only moves). If the offset-correction loop is ever wrong, `movePage` silently corrupts page order with no error. | `lesezeichen_sortierer.js:350-355` | Add a guard: `if (vonSeite < aktuellerEinfuegePunkt) { app.alert("Interner Fehler: Rückwärtsbewegung erkannt."); return []; }`. Documented as Bug A / Option A1 in `plan.md`. |
| 3 | Correctness | Medium | Offset recalculation in `sortiereSeitenBloecke` is a `uiPosition`-based heuristic (lines 360-379) that the project's own CLAUDE.md flags as fragile for deeply-nested/out-of-order bookmarks. No test PDF exercises this. | `lesezeichen_sortierer.js:360-379` | Stress-test with a deeply nested + reverse-ordered bookmark tree; consider rebuilding the document into a fresh Doc instead of in-place `movePage` offset bookkeeping. |
| 4 | Correctness | Medium | Zero-length blocks (`laenge === 0`) are not guarded. A main bookmark sharing a start page edge-case, or a final block where `gesamtSeiten === startPage`, yields a 0-iteration move loop or could under-count. Two adjacent main bookmarks resolving to the same page also produce `laenge = 0`. | `lesezeichen_sortierer.js:79-97, 350` | Add an explicit `if (anzahlSeiten <= 0) continue;`-style guard and decide intended behaviour. Listed as item F in `plan.md`. |
| 5 | Correctness | Low | `deletePages` guard `if (this.numPages > 1)` is evaluated per-iteration while deleting a multi-page TOC block; deleting the last remaining page of a 1-page doc is silently skipped, leaving a stale TOC page and a now-inconsistent offset. | `lesezeichen_sortierer.js:253-257` | Guard against deleting all pages explicitly, or handle the "TOC is the whole document" case up front. |
| 6 | Consistency | High | Two CLAUDE.md files exist at project root: `CLAUDE.md` and `adobe_add_in_lesezeichen_claude.md`. Workspace convention (`general_stuff_claude.md`) requires exactly `{project_name}_claude.md`. They have diverged: the header link differs (`%20` URL-encoding vs. escaped space) and the root `CLAUDE.md` lacks an actual content delta otherwise. The workspace root CLAUDE.md also lists this project's CLAUDE.md as "missing". | `CLAUDE.md`, `adobe_add_in_lesezeichen_claude.md` | Keep only `adobe_add_in_lesezeichen_claude.md` (per naming convention), delete the generic `CLAUDE.md`, and update the workspace root pointer which currently marks it missing. |
| 7 | Dead code | Low | Commented-out `insertChild` call (line 72) and several "ALT:" commented-out alternative lines (191, 200, 210, 219) remain in the source. The `insertChild` omission is intentional (documented Bug B), but the dead "ALT" comments are noise. | `lesezeichen_sortierer.js:72, 191, 200, 210, 219` | Remove "ALT:" historical comments; keep a single short note for the intentional `insertChild` skip. |
| 8 | Code style | Low | `var i` is re-declared in multiple sibling loops within the same function scope (function-scoped `var`, so it's the same variable). Harmless in Acrobat ES3 but flagged as cleanup item E. | `lesezeichen_sortierer.js:162-163, 271, 360` | Reuse one declaration or rename inner loop counters; cosmetic. |
| 9 | Maintainability | Low | Magic layout numbers (`22`, `80`, `50`, `15`, `4`, `595`, `842`) are inline. | `lesezeichen_sortierer.js:142-145, 187, 193` | Extract to named constants at the top of the trusted function. Listed as item D. |
| 10 | Robustness | Medium | The misleading line-1 comment ("Stoppt das Skript und gibt Zeit…") describes behaviour the `ermittleLesezeichenTiefe` function does not have — it computes depth, it does not stop. Stale/incorrect comment. | `lesezeichen_sortierer.js:2` | Replace with an accurate one-line description of depth computation. |
| 11 | Robustness | Low | `bereinigeDuplikate` keys the duplicate map by raw `startPage` number into a plain `{}` object. Page indices are integers so this is safe, but relying on object-key coercion is fragile if `startPage` ever becomes non-integer. | `lesezeichen_sortierer.js:59-76` | Acceptable as-is; note only. Optionally key as `"p" + s`. |
| 12 | Security | Low (informational) | Script self-elevates via `app.trustedFunction` + `app.beginPriv`/`endPriv` and constructs a bookmark action string `"this.pageNum = 0;"`. No untrusted input flows into `setAction`/`createChild`, so no injection today. But bookmark `name` values are user/PDF-controlled and are written into form-field `value` (safe) — not into any `eval`/action string (good). | `lesezeichen_sortierer.js:153-169, 158, 165` | No action required. Keep action strings free of interpolated PDF-derived data. |
| 13 | Docs | Medium | No `FEATURES_REQUIRED.md` defining critical user paths, so integration/feature validation cannot be automated by future audits. | project root | Add `FEATURES_REQUIRED.md` listing e.g. "sorts pages to bookmark order", "regenerates TOC", "removes prior auto-TOC", "registers View menu item". |
| 14 | Versioning | Low | No version header in the script; CLAUDE.md notes "first release, add v1.0.0 header next". | `lesezeichen_sortierer.js:1` | Add a `// v1.0.0` (or current) header comment block. |
| 15 | Process | Low | `plan.md` is a planning artifact in the repo root of a public project. Per workspace memory (`feedback_zeitplaner_user_inputs`), plan_*.md content should migrate into CLAUDE.md before archiving. | `plan.md` | Migrate the still-relevant Bug A/B/C analysis into the "Known issues" section of the CLAUDE.md, then archive/remove `plan.md`. |

---

## Summary

**Findings by severity:** High 3 · Medium 4 · Low 8 (15 total)

The project is a small, single-file, well-documented Acrobat add-in. Code quality is reasonable and the CLAUDE.md/plan.md are unusually thorough about known risks. Most issues are already self-identified in `plan.md`; the audit confirms them and adds repo-hygiene findings.

### Top 3 critical/high fixes
1. **Bug C (finding 1):** Replace `bm.execute()` with `bm.pageNum` in `getBookmarkPage`. This is the highest-impact correctness fix — it removes the risk of wrong page resolution and mid-run dialog blocking on non-page bookmarks.
2. **Bug A guard (finding 2):** Add the backward-move guard in `sortiereSeitenBloecke` so an offset-tracking bug surfaces as an explicit error instead of silent page corruption.
3. **Duplicate CLAUDE.md (finding 6):** Resolve the two divergent CLAUDE.md files down to the convention-named one and fix the workspace pointer that marks it "missing".

### Top 2 architectural improvements
1. **Rebuild instead of in-place reorder:** The fragile `uiPosition`-based offset bookkeeping (findings 2–4) exists only because pages are reordered in place. Building the sorted output by appending blocks into a fresh Doc (or extracting/recombining) would eliminate the entire class of offset bugs.
2. **Introduce a small assertion/precondition layer:** Acrobat JS lacks `assert`; a tiny `pruefe(bedingung, meldung)` helper used at key invariants (forward-move, non-zero block length, page-bookmark only) would turn today's silent-corruption risks into clear user-facing errors.

### Quick wins (easy, high impact)
- Add the backward-move guard (finding 2) — a few lines.
- Fix the incorrect line-1 comment (finding 10).
- Remove dead "ALT:" comments (finding 7).
- Delete the duplicate `CLAUDE.md` (finding 6).
- Add a version header (finding 14).

### Pre-flight status
Build / lint / test: **N/A** for this project type (Acrobat-hosted, no toolchain — by design). Dynamic runtime validation requires Adobe Acrobat + a PDF and was not possible in this environment.
