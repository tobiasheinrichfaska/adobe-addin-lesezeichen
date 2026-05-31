# FEATURES_REQUIRED.md — Adobe Add In - Lesezeichen

Documents the Adobe Acrobat version, permissions, and API features required to run `lesezeichen_sortierer.js`.

---

## Acrobat version

| Requirement | Minimum |
|---|---|
| Adobe Acrobat | **Standard or Pro DC** (any current version) |
| Acrobat Reader | **Not supported** — Reader does not allow page manipulation or trusted functions |

The script uses `app.beginPriv()` / `app.endPriv()` for elevated privileges. These APIs are unavailable in Acrobat Reader.

## Required Acrobat permissions / trust level

The script must run as a **trusted** or **folder-level** script:

| Deployment method | Trust level granted |
|---|---|
| Folder-level script (`%APPDATA%\Adobe\Acrobat\<version>\JavaScripts\`) | Full trust — `app.trustedFunction` works |
| Pasted into JavaScript console (Ctrl+J) | Full trust within the console session |
| Embedded document script | Not trusted — `app.trustedFunction` will throw a security exception |

## APIs used and their availability

| API | Acrobat Standard | Acrobat Pro | Notes |
|---|---|---|---|
| `app.trustedFunction` | Yes | Yes | Requires folder-level or console execution |
| `app.beginPriv` / `app.endPriv` | Yes | Yes | Grants privilege for page manipulation |
| `this.bookmarkRoot` | Yes | Yes | Read-only in Reader |
| `bm.execute()` | Yes | Yes | Navigates to bookmark target; see Known Issues #1 |
| `this.movePage()` | Yes | Yes | Requires `beginPriv` |
| `this.newPage()` | Yes | Yes | Requires `beginPriv` |
| `this.deletePages()` | Yes | Yes | Requires `beginPriv` |
| `this.addField()` | Yes | Yes | Creates form fields |
| `app.addMenuItem()` | Yes | Yes | Registers menu item at Acrobat startup |

## JavaScript security settings

Acrobat must have JavaScript enabled:

**Edit → Preferences → JavaScript → Enable Acrobat JavaScript** ✓

If JavaScript is disabled, the menu item will not appear and the script will not run.

---

*Last updated: 2026-05-31*
