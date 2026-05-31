// v1.0.0
function ermittleLesezeichenTiefe(bm) {
    var tiefe = 0;
    var aktuellesBM = bm;
    while (aktuellesBM && aktuellesBM !== this.bookmarkRoot) {
        tiefe++;
        aktuellesBM = aktuellesBM.parent;
    }
    return tiefe;
}



// =========================================================================
// GLOBALER ZÄHLER & HILFSFUNKTIONEN (EBENE 1)
// =========================================================================

var aktuellerUiIndex = 0;

// Hilfsfunktion: Ermittelt die Zielseite eines Lesezeichens
function getBookmarkPage(bm) {
    var currentPage = this.pageNum;
    bm.execute();
    var targetPage = this.pageNum;
    this.pageNum = currentPage;
    return targetPage;
}

// Rekursive Funktion: Befüllt UI-Liste und Arbeitsliste parallel
function befulleBeideListenRekursiv(bm, uiListe, arbeitsliste) {
    if (bm.children != null) {
        for (var i = 0; i < bm.children.length; i++) {
            var child = bm.children[i];
            var zielSeite = getBookmarkPage(child);

            child.uiPosition = aktuellerUiIndex;
            uiListe.push(child);

            arbeitsliste.push({
                bookmark: child,
                startPage: zielSeite,
                laenge: 0,
                istHauptLesezeichen: true,
                childCount: 0,
                uiPosition: aktuellerUiIndex
            });

            aktuellerUiIndex++;
            befulleBeideListenRekursiv(child, uiListe, arbeitsliste);
        }
    }
}

// =========================================================================
// LOGIK-BAUSTEINE FÜR DIE ARBEITSLISTE (EBENE 2)
// =========================================================================

// Verarbeitet doppelte Lesezeichen auf derselben Seite
function bereinigeDuplikate(arbeitsliste) {
    var seitenMap = {};
    for (var i = 0; i < arbeitsliste.length; i++) {
        var eintrag = arbeitsliste[i];
        var s = eintrag.startPage;

        if (seitenMap[s] === undefined) {
            seitenMap[s] = i;
        } else {
            eintrag.istHauptLesezeichen = false;
            var erstVorkommenIndex = seitenMap[s];
            var hauptEintrag = arbeitsliste[erstVorkommenIndex];

            hauptEintrag.childCount++;
        }
    }
}

// Berechnet temporär die Blocklängen, um das IHV korrekt zu vermessen
function berechneBlockLaengen(arbeitsliste, gesamtSeiten) {
    for (var i = 0; i < arbeitsliste.length; i++) {
        if (!arbeitsliste[i].istHauptLesezeichen) continue;

        var naechsterIndex = -1;
        for (var j = i + 1; j < arbeitsliste.length; j++) {
            if (arbeitsliste[j].istHauptLesezeichen) {
                naechsterIndex = j;
                break;
            }
        }

        if (naechsterIndex !== -1) {
            arbeitsliste[i].laenge = arbeitsliste[naechsterIndex].startPage - arbeitsliste[i].startPage;
        } else {
            arbeitsliste[i].laenge = gesamtSeiten - arbeitsliste[i].startPage;
        }
    }
}

// =========================================================================
// HAUPTFUNKTION (ALS VERTRAUENSWÜRDIGE FUNKTION) & MENÜEINTRAG
// =========================================================================

// Wir deklarieren die Funktion als vertrauenswürdig, um Sicherheitsblockaden zu umgehen
var ausfuehrenSortierungOptimiert = app.trustedFunction(function() {
    var root = this.bookmarkRoot;
    if (!root || root.children == null) {
        app.alert("Keine Lesezeichen im Dokument gefunden.", 1);
        return;
    }

    var uiListe = [];
    var arbeitsliste = [];
    aktuellerUiIndex = 0;

    befulleBeideListenRekursiv(root, uiListe, arbeitsliste);

    arbeitsliste.sort(function(a, b) {
        return a.startPage - b.startPage;
    });

    bereinigeDuplikate(arbeitsliste);

    berechneBlockLaengen(arbeitsliste, this.numPages);

    loescheInhaltsverzeichnisUndBerechneOffset(arbeitsliste);

    berechneBlockLaengen(arbeitsliste, this.numPages);

    // KORREKTUR: Wir fangen das von Schritt 5 zurückgegebene Array ab
    var ihvDruckDaten = sortiereSeitenBloecke(uiListe, arbeitsliste);

    // =========================================================================
    // AUTOMATISCHES INHALTSVERZEICHNIS ZEICHNEN (KORRIGIERT)
    // =========================================================================

    var seitenBox = this.getPageBox("Crop", 0);
    // FIX: Wir greifen exakt auf die Array-Indizes zu, um echte Zahlen zu erhalten!
    var breite = seitenBox[2] - seitenBox[0]; // Rechts minus Links (ca. 595 Punkte)
    var hoehe = seitenBox[1] - seitenBox[3];  // Oben minus Unten (ca. 842 Punkte)

    var zeilenAbstand = 22;
    var randOben = 80;
    var randUnten = 50;
    var randLinks = 50;
    var randRechts = 80;
    var einrueckungProTiefe = 15;
    var nutzbareHoehe = hoehe - randOben - randUnten;
    var zeilenProSeite = Math.floor(nutzbareHoehe / zeilenAbstand);

    // Seitenanzahl berechnen direkt aus unserem mitgeschriebenen Array
    var anzahlEintraege = ihvDruckDaten.length;
    var benoetigteSeiten = Math.ceil(anzahlEintraege / zeilenProSeite);
    if (benoetigteSeiten < 1) benoetigteSeiten = 1;

    // Privilegierter Bereich für das Erzeugen neuer Seiten
    app.beginPriv();
    for (var s = 0; s < benoetigteSeiten; s++) {
        this.newPage(s, breite, hoehe);
    }
    // Wir erstellen das Lesezeichen unfehlbar neu, genau hier auf Position 0 (ganz oben)
    this.bookmarkRoot.createChild("Automatisches Inhaltsverzeichnis", "this.pageNum = 0;", 0);
    app.endPriv();

    var rootNeu = this.bookmarkRoot;
    if (rootNeu && rootNeu.children) {
        for (var i = 0; i < rootNeu.children.length; i++) {
            if (rootNeu.children[i].name.toLowerCase() === "automatisches inhaltsverzeichnis") {
                rootNeu.children[i].setAction("this.pageNum = 0;");
                break;
            }
        }
    }

    var aktuelleZeile = 0;
    var aktuelleIhvSeite = 0;

    // Wir drucken die Daten stur aus unserem mitgeschriebenen Array aus Schritt 5!
    for (var n = 0; n < ihvDruckDaten.length; n++) {
        var datensatz = ihvDruckDaten[n];

        // Versatz der IHV-Seiten einrechnen
        var zielSeiteImPDF = datensatz.finaleStartSeite + benoetigteSeiten;

        if (aktuelleZeile >= zeilenProSeite) {
            aktuelleZeile = 0;
            aktuelleIhvSeite++;
        }

        var yPosition = hoehe - randOben - (aktuelleZeile * zeilenAbstand);
        var xEinrueckung = randLinks + (datensatz.tiefe * einrueckungProTiefe);

        // A: Titel als Textfeld zeichnen (OHNE Hyperlink)
        var feldName = "IHV_Text_" + n;
        // PDF Y-axis: lower coordinate = bottom, higher coordinate = top
        var textRect = [xEinrueckung, yPosition - zeilenAbstand + 4, breite - randRechts, yPosition];
        var txtFeld = this.addField(feldName, "text", aktuelleIhvSeite, textRect);
        if (txtFeld) {
            txtFeld.value = datensatz.name;
            txtFeld.readonly = true;
            txtFeld.alignment = "left";
            txtFeld.textSize = (datensatz.tiefe === 0) ? 12 : 10;
            // textFont requires string names, not font.* constants
            txtFeld.textFont = (datensatz.tiefe === 0) ? "Helvetica-Bold" : "Helvetica";

            txtFeld.borderStyle = border.s;
            txtFeld.lineWidth = 0;
        }

        // B: Seitenzahl als Textfeld zeichnen (Rechtsbündig)
        var seitenFeldName = "IHV_Seite_" + n;
        var seitenRect = [breite - 75, yPosition - zeilenAbstand + 4, breite - 50, yPosition];
        var seitFeld = this.addField(seitenFeldName, "text", aktuelleIhvSeite, seitenRect);
        if (seitFeld) {
            seitFeld.value = (zielSeiteImPDF + 1).toString();
            seitFeld.readonly = true;
            seitFeld.alignment = "right";
            seitFeld.textSize = (datensatz.tiefe === 0) ? 12 : 10;
            seitFeld.textFont = (datensatz.tiefe === 0) ? "Helvetica-Bold" : "Helvetica";

            seitFeld.borderStyle = border.s;
            seitFeld.lineWidth = 0;
        }

        aktuelleZeile++;
    }

    app.alert("Das Dokument wurde sortiert und das Inhaltsverzeichnis mit " + benoetigteSeiten + " Seite(n) generiert!", 3);
});


// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// SCHRITT 4 - INHALTSVERZEICHNIS LÖSCHEN & OFFSET BERECHNEN
// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
function loescheInhaltsverzeichnisUndBerechneOffset(arbeitsliste) {
    var ihvStartSeite = -1;
    var ihvSeitenAnzahl = 0;

    // Wir durchlaufen die Arbeitsliste rückwärts, damit das Löschen
    // eines Eintrags (splice) die Indizes der Schleife nicht stört
    for (var i = arbeitsliste.length - 1; i >= 0; i--) {
        var eintrag = arbeitsliste[i];

        // Suchen nach dem exakten Namen (Groß-/Kleinschreibung ignoriert)
        if (eintrag.bookmark.name.toLowerCase() === "automatisches inhaltsverzeichnis") {
            ihvStartSeite = eintrag.startPage;
            ihvSeitenAnzahl = eintrag.laenge;

            // 1. Die physischen Seiten des Inhaltsverzeichnisses aus dem PDF löschen
            var endPage = ihvStartSeite + ihvSeitenAnzahl - 1;
            for (var p = endPage; p >= ihvStartSeite; p--) {
                if (this.numPages > 1) {
                    this.deletePages(p, p);
                }
            }

            // 2. Das Lesezeichen selbst aus der Acrobat-Struktur entfernen
            eintrag.bookmark.remove();

            // 3. Den Eintrag aus unserer datentechnischen Arbeitsliste löschen
            arbeitsliste.splice(i, 1);
            break; // Suche beenden, da es nur ein automatisches IHV gibt
        }
    }

    // 4. GLOBALER OFFSET: Wenn Seiten gelöscht wurden, passen wir die Startseiten
    // aller verbleibenden Lesezeichen an, die physisch HINTER dem IHV lagen.
    if (ihvSeitenAnzahl > 0) {
        for (var k = 0; k < arbeitsliste.length; k++) {
            if (arbeitsliste[k].startPage > ihvStartSeite) {
                arbeitsliste[k].startPage -= ihvSeitenAnzahl;
            }
        }
    }
}

// =========================================================================
// SCHRITT 5: SEITEN BLOCKWEISE UMSORTIEREN ANHAND DER UI-REIHENFOLGE
// =========================================================================
function sortiereSeitenBloecke(uiListe, arbeitsliste) {
    var aktuellerEinfuegePunkt = 0;

    // NEU: Unsere Gedächtnis-Variable für die Sekundärzeichen
    var letzteGueltigeHauptSeite = 0;

    // NEU: Hier sammeln wir die fertigen Druckdaten für das Inhaltsverzeichnis
    var ihvDruckDaten = [];

    // Wir gehen die verbleibenden Lesezeichen in der exakten UI-Reihenfolge durch
    for (var i = 0; i < uiListe.length; i++) {
        var zielBM = uiListe[i];
        var datenIndex = -1;

        // Finde den passenden Datenblock in der physikalisch sortierten Arbeitsliste
        for (var j = 0; j < arbeitsliste.length; j++) {
            // Wir verarbeiten NUR Hauptlesezeichen (Sekundäre hängen bereits als Child drunter)
            if (arbeitsliste[j].bookmark === zielBM) {
                datenIndex = j;
                break;
            }
        }


        // 2. DAS BLITZ-CONTINUE: Wenn es existiert, aber KEIN Hauptlesezeichen ist,
        // überspringen wir diese Schleifenrunde sofort und komplett!
        // =====================================================================
        // SCHRITT B: DIE CONTINUE-WEICHE (FÜR SEKUNDÄRPUNKTE)
        // =====================================================================
        if (datenIndex !== -1 && !arbeitsliste[datenIndex].istHauptLesezeichen) {
            // Wenn es ein Sekundärpunkt ist, schreiben wir ihn JETZT ins IHV.
            // Da er auf dieselbe Seite wie das aktuelle Hauptkapitel verweist,
            // nutzen wir einfach den unfehlbaren 'aktuellerEinfuegePunkt'!
            if (zielBM.name.toLowerCase() !== "automatisches inhaltsverzeichnis") {
                ihvDruckDaten.push({
                    name: zielBM.name,
                    tiefe: ermittleLesezeichenTiefe(zielBM),
                    finaleStartSeite: letzteGueltigeHauptSeite
                });
            }
            // Danach überspringen wir die physische Verschiebung
            continue;
        }



        // Wenn das Lesezeichen in der Arbeitsliste existiert (und nicht das gelöschte IHV war)
        if (datenIndex !== -1) {
            var block = arbeitsliste[datenIndex];
            var vonSeite = block.startPage;
            var anzahlSeiten = block.laenge;
            var aktuelleUiPos = block.uiPosition;

            // =====================================================================
            // KORREKTUR: GENAU HIER BEFÜLLEN WIR DAS ARRAY FÜR DEN DRUCK!
            // =====================================================================
            if (zielBM.name.toLowerCase() !== "automatisches inhaltsverzeichnis") {
                ihvDruckDaten.push({
                    name: zielBM.name,
                    tiefe: ermittleLesezeichenTiefe(zielBM),
                    finaleStartSeite: aktuellerEinfuegePunkt
                });
                letzteGueltigeHauptSeite = aktuellerEinfuegePunkt;
            }
            // =====================================================================


            // 1. Seiten des Blocks nacheinander an den aktuellen Einfügepunkt verschieben
            for (var k = 0; k < anzahlSeiten; k++) {
                // Da nach jedem Verschieben die nächste Seite nachrückt, verschieben wir
                // die Seiten mathematisch präzise nacheinander.

                this.movePage(vonSeite + k, aktuellerEinfuegePunkt + k - 1);
            }

            // 2. PRÄZISE OFFSET-ANPASSUNG (Mathematischer Kern)
            // Da sich das Dokument physisch verschoben hat, passen wir die Startseiten
            // aller verbleibenden Blöcke in der Programmliste an.
            for (var m = 0; m < arbeitsliste.length; m++) {
                if (m === datenIndex || !arbeitsliste[m].istHauptLesezeichen) continue;

                var andererBlock = arbeitsliste[m];

                // Fall A: Der andere Block lag physisch vor der Quelle, rückt durch das Einfügen nach hinten
                if (andererBlock.startPage >= aktuellerEinfuegePunkt && andererBlock.startPage < vonSeite) {
                    // Er wurde durch das Einfügen nach hinten geschoben -> Startseite erhöht sich
                    if (andererBlock.uiPosition > aktuelleUiPos) {
                        andererBlock.startPage += anzahlSeiten;
                    }
                }
                // Fall B: Der andere Block lag physisch hinter der Quelle, wird durch das Vorziehen nach vorne geschoben
                else if (andererBlock.startPage > vonSeite && andererBlock.startPage < aktuellerEinfuegePunkt) {
                    // Er wurde nach vorne geschoben -> Startseite verringert sich
                    if (andererBlock.uiPosition < aktuelleUiPos) {
                        andererBlock.startPage -= anzahlSeiten;
                    }
                }
            }

            // Einfügepunkt für den nächsten Block im PDF nach rechts verschieben
            aktuellerEinfuegePunkt += anzahlSeiten;
        }
    }
    // NEU: Wir geben die gesammelten Daten an die Hauptfunktion zurück
    return ihvDruckDaten;
}




// Registrierung im Menü "Anzeige"
if (typeof app.addMenuItem !== "undefined") {
    app.addMenuItem({
        cName: "LesezeichenSortieren",
        cUser: "PDF nach Lesezeichen sortieren",
        cParent: "View",
        cExec: "ausfuehrenSortierungOptimiert();",
        cEnable: "event.rc = (event.target != null);"
    });
}
