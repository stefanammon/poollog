# FreePoolLog4U Mini 1.0.0-beta.5 – CSV-Export (Dezimaltrennzeichen) und Wasseruhr-Erfassung bei Wasserfüllung

**Stand:** 24.08.2026
**Version:** Mini Version 1.0.0-beta.5 (unverändert)
**Status:** umgesetzt und mit isolierten Node-Tests der reinen Formatierungs-/Berechnungslogik geprüft. Browser-/Gerätetest sowie Ausführung der Supabase-Migration stehen noch aus (siehe Abschnitt 7).

## 1. Rahmenbedingung

FreePoolLog4U Mini 1.0.0-beta.5 befindet sich grundsätzlich im Release-/Feature-Freeze. Stefan hat am 24.08.2026 beim ersten vollständigen Excel-Import seiner Export-CSV (`Pool_Masterdaten_20260824.csv`, 165 Zeilen seit 16.06.2026) mehrere Probleme gemeldet, die in einem vorherigen Chat (ohne Repository-/DB-Zugriff, nur anhand der Export-Datei) analysiert wurden: Dezimalfelder kommen in Excel als Ganzzahl an, die Wasseruhr-Felder (`Wasseruhr_vorher_m3`/`Wasseruhr_nachher_m3`) sind trotz vorhandener Eingaben leer, `Mengenerfassung` ist nie gesetzt, `Wassermenge_l` kommt als Textfeld an. Diese Session hatte erstmals Zugriff auf das Repository (nicht auf die Supabase-Datenbank direkt) und konnte die Ursachen im Code lokalisieren.

## 2. Befund 1: Dezimal-Trennzeichen-Konflikt im CSV-Export

Bestätigt: Der Export schrieb Nachkommawerte durchgängig mit Punkt (`0.62`, `7.76`, `26.6`, …), obwohl gleichzeitig Semikolon als Feldtrennzeichen verwendet wird – das ist die für deutsches Excel/Power Query typische Locale-Konvention, bei der Komma als Dezimaltrennzeichen erwartet wird. Excel (deutsches Gebietsschema) erkennt den Punkt deshalb nicht als Dezimaltrennzeichen; betroffene Spalten werden als Ganzzahl interpretiert bzw. Werte falsch zusammengesetzt.

**Ursache im Code:** `dbNumberText()`/`numericValueOf()` sowie mehrere direkte `String(...)`-Umwandlungen liefern Zahlen intern durchgehend mit Punkt (JS-Konvention) – konsistent verwendet in DB-Zugriff, `buildRecord()`/`validateRecord()` (die dort `Number(...)` aufrufen) und im JSON-Backup. Der CSV-Export (`exportCSV()`/`exportRangeCSV()`) hat diese Strings bislang unverändert übernommen.

**Fix:** Eine neue, zentrale Formatierungsstelle ausschließlich für den CSV-Export in `app.js`:

- `NUMERIC_CSV_HEADERS` – Set aller 21 Spalten mit möglichen Nachkommastellen (`Wasserlinie`, `Wassertemperatur`, `Außentemperatur`, `fCl`, `CYA`, `TA`, `pH`, `Dach_Offen_h`, `Badebetrieb_h`, `Chlorschwimmer_h`, `Pumpe_h`, `CHC_g`, `Menge`, `Wasseruhr_vorher_m3`, `Wasseruhr_nachher_m3`, `Wasserlinie_vorher_mm`, `Wasserlinie_nach_Ablassen_mm`, `Wasserlinie_nach_Auffuellen_mm`, `Entferntes_Wasser_l`, `Zugefuehrtes_Wasser_l`, `Wasserstandsaenderung_cm`, `Wassermenge_l`).
- `formatCsvField(header, value)` – ersetzt für diese Spalten einen vorhandenen Punkt durch ein Komma, sofern der Wert numerisch ist; leere/nicht-numerische Werte bleiben unverändert.
- `exportCSV()` und `exportRangeCSV()` (die beiden einzigen Stellen, die `HEADERS` in eine CSV-Zeile serialisieren) rufen jetzt `formatCsvField()` vor `csvEscape()` auf.

Bewusst **nicht** angefasst: DB-Zugriff, `buildRecord()`/`validateRecord()` (dort bleibt `Number(rec.Feld)` mit Punkt gültig), JSON-Backup (`exportJSON()` bleibt unverändert – Zahlen dort weiterhin mit Punkt, korrekt für maschinelles Einlesen). Die Änderung ist auf den CSV-Export begrenzt.

## 3. Befund 2: Wasseruhr-Felder bei „Wasserfüllung“ – Formular-Lücke, kein Bug

**Lokalisierung (Code-Analyse statt Live-DB-Abfrage):** Die Felder `MeterBefore`/`MeterAfter` und die Spalte `Mengenerfassung` existierten im Code bereits – aber ausschließlich im Ablauf „Wasserpflege → Teilwasseraustausch/Vollständiger Wasseraustausch“ (`water_care_details`-Tabelle, `attachWaterCareDetails()`). Die Aktion **„Wasserfüllung“**, die Stefan am 31.07.2026 für den Eintrag mit den Zählerständen „Start Wasserzähler 109,387 m³“ / „Endstand … 109,867 m³“ genutzt hat, hatte dafür strukturell **kein** Eingabefeld – nur Wasserlinie vorher/nachher (mm) und eine optionale manuelle Literangabe. Die Zählerstände landeten deshalb zwangsläufig nur im Freitext (`Notiz`).

Das ist kein Bug in der Export-Funktion und keiner in der Speicherlogik des bestehenden Wasseraustausch-Pfads (beide funktionieren für ihren jeweiligen Anwendungsfall korrekt) – sondern eine Lücke: Für einen reinen Nachfüll-Vorgang ohne Wasser abzulassen gab es keine Wasseruhr-Option.

**Abstimmung mit Stefan (24.08.2026):** Drei Optionen zur Wahl gestellt – (1) Wasserfüllung um ein optionales Wasseruhr-Feldpaar erweitern, (2) Wasserfüllung unverändert lassen und stattdessen auf „Wasseraustausch“ verweisen, (3) Wasseruhr-Felder vorerst bewusst ungenutzt lassen. **Ergebnis: Option 1.**

### 3.1 Umsetzung

`index.html` – in der Wasserfüllung-Karte (`#otherBlock`) zwei neue, optionale Felder ergänzt: „Wasseruhr vor Auffüllen“ / „Wasseruhr nach Auffüllen“ (`#WaterFillMeterBefore`/`#WaterFillMeterAfter`, m³, `step="0.001"`), mit Hinweistext, dass sie bei vollständiger Eingabe die manuelle Wassermenge automatisch ersetzen.

`app.js`:

- `buildRecord()` (Zweig `Wasserfüllung`): liest die neuen Felder; sind beide gültig und aufsteigend, wird daraus die zugeführte Menge in Litern berechnet (`(nachher − vorher) × 1000`) und hat **Vorrang** vor einer zusätzlich vorhandenen manuellen Angabe. `Mengenerfassung="water_meter"` sowie `Wasseruhr_vorher_m3`/`Wasseruhr_nachher_m3` werden nur in diesem Fall gesetzt.
- `validateRecord()`: neue Prüfung – ist nur eines der beiden Wasseruhr-Felder gefüllt, wird das **abgelehnt** (klare Fehlermeldung statt stillem Datenverlust, wie es beim Freitext-Workaround am 31.07. passiert ist); ist der Endstand nicht größer als der Anfangsstand, ebenfalls Fehlermeldung.
- `eventToDb()`/`eventFromDb()`: zwei neue Spalten `meter_before_m3`/`meter_after_m3` direkt auf `public.events` (analog zu den bereits vorhandenen `waterline_before_mm`/`water_added_volume_l` aus der Beta5-Migration vom 15.08.2026, siehe `docs/MINI_POST_FREEZE_CHANGES_BETA5.md`) – bewusst **nicht** über `water_care_details`, da diese Tabelle inhaltlich an `care_action` (Wasserpflege) gebunden ist und für einen reinen Nachfüll-Vorgang kein passendes `care_action` existiert.
- `humanSummary()`: zeigt bei Wasseruhr-Nutzung „Wasseruhr *vorher* → *nachher* m³ · *x* l zugeführt“ analog zur bestehenden Darstellung beim Wasseraustausch.
- `editRecord()`: befüllt die neuen Felder beim Bearbeiten eines bestehenden Wasserfüllung-Eintrags vor.

**Datenbank:** Neue Migration `SUPABASE_POSTFREEZE_20260824_WASSERFUELLUNG_WASSERUHR.sql` (Muster wie bei der Beta5-Migration): ergänzt `public.events.meter_before_m3`/`meter_after_m3` (nullable) und einen CHECK-Constraint (`meter_after_m3 > meter_before_m3`, falls beide gesetzt). Keine neuen Tabellen, bestehende RLS-Policies bleiben maßgeblich.

**Wichtiger Deployment-Hinweis:** Diese SQL-Migration muss **vor** dem Deployment der aktualisierten `app.js` im Supabase SQL Editor ausgeführt werden. `eventToDb()` sendet ab sofort bei **jedem** Speichern eines Wasserfüllung-Eintrags die Schlüssel `meter_before_m3`/`meter_after_m3` (auch als `null`) im Payload – PostgREST lehnt Inserts/Updates mit unbekannten Spalten im Payload ab. Ohne vorherige Migration würde also nicht nur die neue Wasseruhr-Option nicht funktionieren, sondern das Speichern **jeder** Wasserfüllung fehlschlagen.

### 3.2 Nebenbefund: Rundungsfehler bei Wasseruhr-Berechnung (zusätzlich gefunden und behoben)

Bei der Implementierung fiel auf, dass `(meterAfter − meterBefore) × 1000` wegen IEEE-754-Gleitkommaarithmetik in JavaScript in bestimmten Fällen kein exaktes Ergebnis liefert (z. B. `109.867 − 109.387 → 480.00000000000006` statt `480`). Das betraf nicht nur den neuen Wasserfüllung-Pfad, sondern auch den bereits bestehenden Wasseraustausch-Pfad (`care_action water_exchange_*`, Methode „Wasseruhr“), der denselben Rechenausdruck bereits vorher verwendete. Neue Hilfsfunktion `roundLiters()` (rundet auf 3 Nachkommastellen – Wasseruhren lösen ohnehin nur bis 0,001 m³ = 1 l auf) an beiden Stellen ergänzt.

## 4. Befund 3: `Mengenerfassung`

Wird jetzt zuverlässig gesetzt und exportiert, sobald eine Mengenerfassungsmethode tatsächlich verwendet wurde: `"water_meter"` bei Wasseruhr-Nutzung (Wasserfüllung wie oben, oder Wasseraustausch wie bisher), `"direct_volume"` beim Wasseraustausch mit gemessenem abgelassenem Wasser. Der Rohwert (Methoden-Code) wird unübersetzt exportiert, konsistent mit anderen Rohwert-Spalten wie `fCl_Status`.

## 5. Befund 4: `Wassermenge_l` – totes Schema-/Exportfeld, bestätigt

Code-Analyse ergibt eindeutig: `calculated_volume_l` (die DB-Spalte hinter `Wassermenge_l`) wird an **keiner** Stelle im Code auf einen Wert ungleich `null` gesetzt – in beiden Zweigen von `buildRecord()`, die `_waterCare` befüllen, steht `calculated_volume_l:null` fest verdrahtet. Das Feld ist aktuell **nicht aktiv genutzt**, sondern ein totes Schema-/Exportfeld – exakt wie es für die Wasseruhr-Felder vor diesem Fix der Fall war, nur dass hier (bislang) keine berechnete Alternative existiert, die dort einfließen könnte.

**Entscheidung:** Kein Code-Fix in diesem Umfang. Das Feld bleibt vorerst wie es ist (leer/Text in Excel bei komplett leerer Spalte); keine Änderung, da außerhalb des mit Stefan abgestimmten Umfangs. Sollte künftig ein tatsächlicher dritter Erfassungsweg für die Wassermenge gewünscht werden, wäre `calculated_volume_l` der vorgesehene Ort dafür.

## 6. Befund 5: `Wasseroptik` „gut“ vs. „Sehr gut“ – kein Bug

Die ursprüngliche Vermutung einer uneinheitlichen Schreibweise hat sich bei Prüfung des `<select id="Wasseroptik">` in `index.html` **nicht** bestätigt: „Sehr gut“ und „gut“ sind zwei bewusst unterschiedliche, eigenständige Auswahloptionen (neben „ok“, „grün“, „braun“, „milchig“) – keine zwei Schreibweisen desselben Werts. Ein „Fix“, der beide zusammenführt, würde tatsächlich unterschiedliche fachliche Bewertungen verlieren. **Keine Änderung vorgenommen.**

## 7. Tests

Da diese Session keinen Zugriff auf einen echten Browser mit laufender Supabase-Anbindung hatte, wurden die reinen, aus `app.js` unverändert übernommenen Formatierungs-/Berechnungsfunktionen isoliert mit Node.js geprüft (`node --check app.js` zusätzlich für die Gesamtdatei):

| Test | Ergebnis |
|---|---|
| `fCl 0.62` → CSV `0,62` | PASS |
| `pH 7.76` → CSV `7,76` | PASS |
| `Wassertemperatur 26.6` → CSV `26,6` | PASS |
| `Chlorschwimmer_h 22.9` → CSV `22,9` | PASS |
| `Menge 15.1` → CSV `15,1` | PASS |
| Ganzzahl (`Wasserlinie -15`) bleibt unverändert | PASS |
| Leerer Wert bleibt leer | PASS |
| `Wasseruhr_vorher_m3 109.387` → CSV `109,387` (3 Nachkommastellen) | PASS |
| Textspalten (`Notiz`, `Kürzel`) werden nicht angefasst, auch bei enthaltenem Komma | PASS |
| `csvEscape` + `formatCsvField` zusammen funktionsfähig | PASS |
| Wasseruhr 109,387 → 109,867 m³ ergibt exakt 480 l (kein Gleitkomma-Artefakt) | PASS |
| Ohne Wasseruhr-Eingabe wird weiterhin die manuelle Literangabe verwendet | PASS |
| Wasseruhr-Berechnung hat Vorrang vor einer zusätzlich vorhandenen manuellen Angabe | PASS |
| Vollständige Beispiel-CSV-Zeile für Wasserfüllung/Wasseruhr erzeugt und Excel-Interpretation (DE-Gebietsschema) simuliert | PASS |
| `HEADERS`-Array unverändert (weiterhin 38 Spalten, gleiche Reihenfolge) | PASS |

**Noch offen (nicht Teil dieser Session, da kein Zugriff auf echten Browser/Supabase/Endgerät):**

- Supabase-Migration `SUPABASE_POSTFREEZE_20260824_WASSERFUELLUNG_WASSERUHR.sql` im produktiven Projekt ausführen (**vor** dem Deployment, siehe Abschnitt 3.1).
- Deployment auf GitHub Pages.
- Realer End-to-End-Test: neuen Wasserfüllung-Eintrag mit Wasseruhr-Werten über das tatsächliche Formular speichern, Export-CSV ziehen und ohne manuelle Nachbearbeitung in Excel/Power Query (deutsches Gebietsschema) öffnen.
- Cache-Update-Verhalten bei bereits installierter PWA/Android-TWA auf einem echten Gerät prüfen.

## 8. Abgrenzung

Keine Änderung der Produktversion `1.0.0-beta.5`. Keine Änderungen am Android-TWA-Wrapper. Keine rückwirkende Korrektur historischer Datensätze – insbesondere bleibt der Eintrag vom 31.07.2026 mit den Wasseruhr-Werten im Freitext (`Notiz`) unverändert; eine etwaige nachträgliche Migration dieses einen Datensatzes ist eine gesonderte, spätere Entscheidung mit Stefan. Keine Änderungen an der übrigen Formular-UX (Sektionsgliederung, Sprungleiste, Fortschrittsanzeige, Dirty-State/Datum-Uhrzeit-Logik aus vorherigen Runden) über das für die Wasseruhr-Ergänzung notwendige Minimum hinaus.

## 9. Runde 2 (24.08.2026, nach erstem Praxistest durch Stefan)

Stefan hat die Wasserfüllung/Wasseruhr-Erweiterung erfolgreich getestet ("Wasserfüllung getestet. klappt") und beim CSV-Export zwei weitere Beobachtungen gemeldet.

### 9.1 `Außentemperatur` und `Dach_Offen_h` weiterhin als Ganzzahl in Excel

**Kein Fehler in der Werte-Umrechnung** (der Punkt-zu-Komma-Fix aus Abschnitt 2 greift korrekt), sondern eine Lücke in der Robustheit dieses Fixes: Excel/Power Query leitet den Spaltentyp beim Import aus den **tatsächlich vorkommenden Werten** ab. Enthält eine Spalte in einem konkreten Export ausschließlich ganzzahlige Werte – bei `Außentemperatur` und `Dach_Offen_h` war das in Stefans bisherigen Daten zufällig durchgehend der Fall –, erkennt Power Query „Ganze Zahl“ statt „Dezimalzahl“, unabhängig davon, dass die Spalte grundsätzlich Nachkommastellen tragen kann (`Dach_Offen_h` wird wie `Chlorschwimmer_h`/`Pumpe_h` automatisch aus verstrichener Zeit berechnet, siehe 9.2, und kann daher jederzeit einen Dezimalwert annehmen, sobald ein Intervall nicht exakt auf eine volle Stunde fällt).

**Fix:** `formatCsvField()` (siehe Abschnitt 2) hängt jetzt für alle `NUMERIC_CSV_HEADERS`-Spalten zusätzlich `,0` an, wenn der Wert zufällig ganzzahlig ist (z. B. `19` → `19,0`). Der Spaltentyp wird dadurch unabhängig von den in einem bestimmten Export konkret vorkommenden Werten stabil als „Dezimalzahl“ erkannt – ohne echte Nachkommastellen zu verändern oder abzuschneiden (ein Wert wie `109,387` bleibt exakt `109,387`). Das behebt nicht nur die zwei gemeldeten Spalten, sondern vorbeugend auch alle anderen `NUMERIC_CSV_HEADERS`-Spalten, die aktuell noch zufällig nur Ganzzahlwerte enthalten (z. B. `CYA`, `TA`) und sonst beim nächsten Export mit demselben Symptom aufgefallen wären.

### 9.2 `Chlorschwimmer_h`/`Pumpe_h` mit „krummen“ Werten wie `9,38` oder `22,9` – kein Fehler

Stefans Vermutung war richtig: *„sind das die automatisch errechneten Differenzen wenn keine konkrete Zahl eingegeben wurde?“* – **ja, genau das.** `Dach_Offen_h`, `Badebetrieb_h`, `Chlorschwimmer_h` und `Pumpe_h` haben im Formular jeweils eine Auswahl „0 h“ / „durchgehend“ / „teilweise“ (`_state`-Feld). Bei **„durchgehend“** berechnet `intervalValueFromState()` automatisch die tatsächlich verstrichene Zeit seit der vorherigen Messung (`currentInterval.hours`, auf zwei Nachkommastellen gerundet) – **nicht** eine von Stefan eingegebene Zahl. Das ist eine bereits bestehende, von dieser Änderung unabhängige Funktion der App.

Stichprobenartig anhand der hochgeladenen `Pool_Masterdaten_20260824.csv` nachgerechnet: Zeile mit `Pumpe_h=9.38` am 21.08. 17:59 – die vorherige Messung war am 21.08. 08:36, also 9 h 23 min = 9,383… h ≈ **9,38 h**. Zeile mit `Chlorschwimmer_h=22.9` am 23.06. 10:19 – vorherige Messung am 22.06. 11:26 mit `Chlorschwimmer_h=0` (Schwimmer gerade erst eingesetzt), also 22 h 53 min = 22,88… h ≈ **22,9 h**. Beide Werte sind damit rechnerisch korrekt und plausibel – sie geben nicht „wie lange die Messung gedauert hat“ wieder (das war Stefans Annahme), sondern „wie lange Schwimmer/Pumpe/Dach/Badebetrieb seit der letzten Messung ununterbrochen im aktuellen Zustand war“, wenn „durchgehend“ gewählt wurde. **Keine Code-Änderung vorgenommen**, da kein Fehler – nur diese Klarstellung dokumentiert.

## 10. PWA-Cache

Service-Worker-Cache-Suffix zweimal hochgezählt: `postfreeze-20260822a` → `postfreeze-20260824a` (Runde 1) → `postfreeze-20260824b` (Runde 2, wegen der `formatCsvField()`-Anpassung aus Abschnitt 9.1). Die Produktversion `1.0.0-beta.5` bleibt unverändert.

## 11. Freeze-Status nach Abschluss

Die hier dokumentierten notwendigen Änderungen sind implementiert und durch isolierte Logik-Tests geprüft (Runde 2 ergänzt Regressionstests für den Ganzzahl-Typ-Fix, siehe Abschnitt 7). **Vor dem endgültigen Abschluss stehen noch aus:** Ausführung der Supabase-Migration (falls noch nicht geschehen), Deployment der Runde-2-Änderungen, realer Browser-/Gerätetest inkl. Prüfung des CSV-Exports in Excel/Power Query ohne manuelle Typkorrektur.

**FreePoolLog4U Mini 1.0.0-beta.5 kehrt nach Abschluss dieser noch offenen Schritte wieder in den Release-/Feature-Freeze zurück.**

Weitere Änderungen an Mini erfolgen nur, wenn im externen Betatest ein fachlich oder technisch notwendiger Änderungsbedarf festgestellt wird.
