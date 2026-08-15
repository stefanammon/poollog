# PoolLog4U Pro – Konzept- und Ideenbestand

**Status:** fortlaufende Konzeptdokumentation  
**Begonnen:** 15.08.2026  
**Produktname:** **PoolLog4U Pro**  

Diese Datei sammelt ab jetzt die für die spätere Pro-Version relevanten fachlichen und technischen Ideen, Entscheidungen und offenen Konzepte. Sie ist bewusst thematisch strukturiert und wird bei neuen Erkenntnissen fortgeschrieben.

## 1. Produktgrenze Mini / Pro

### FreePoolLog4U Mini

- dokumentiert Messungen, Zustände, Aktionen und verwendete Produkte;
- bewahrt historische Primärdaten möglichst unverfälscht auf;
- gibt keine chemischen Empfehlungen und keine Dosierungsberatung;
- soll nur solche Zusatzdaten erfassen, deren Fehlen spätere fachliche Auswertungen wesentlich entwerten würde.

### PoolLog4U Pro

- wertet die in Mini und Pro erfassten Daten intelligent aus;
- darf Empfehlungen, Dosierungsberechnungen, Plausibilitätsprüfungen und Folgeprozesse anbieten;
- soll Unsicherheit und Datenqualität berücksichtigen, statt Scheingenauigkeit zu erzeugen;
- baut auf langfristig konsistenten historischen Primärdaten auf.

Leitprinzip: **Mini dokumentiert – Pro wertet intelligent aus.**

## 2. Wasserlinie als dauerhaftes Referenzsystem

### 2.1 Grundmodell

Jeder Pool verwendet eine physische 0-Marke. Wasserlinienwerte werden in Millimetern relativ zu dieser Marke gespeichert:

- `0 mm` = Wasser auf Höhe der Referenzmarke;
- `-5 mm` = 5 mm darunter;
- `+5 mm` = 5 mm darüber.

Die Millimeterauflösung ist beabsichtigt.

### 2.2 Mini-Regel

Mini kennt genau **eine** Wasserlinien-Referenz pro Pool. Sie wird einmal bestätigt und danach nicht mehr verändert oder gelöscht. Dadurch beziehen sich alle historischen Mini-Wasserlinien auf dasselbe Koordinatensystem.

### 2.3 Referenzwechsel in PoolLog4U Pro

Pro darf eine physische 0-Marke später versetzen. Eine bestehende Referenz wird dabei niemals überschrieben. Stattdessen wird eine neue, versionierte Referenz angelegt.

Ein mögliches Pro-Datenmodell enthält:

- `reference_id`;
- `pool_id`;
- `valid_from` / `valid_to`;
- Höhe der 0-Marke über einem eindeutig definierten Bodenbezug;
- Offset zur vorherigen Referenz in mm;
- `previous_reference_id`;
- Anlass/Notiz zum Referenzwechsel.

Damit bleiben ältere und neuere Messwerte mathematisch ineinander überführbar.

Beispiel:

- Referenz A: 0-Marke 1.300 mm über Bodenbezug;
- Referenz B: 20 mm höher, also 1.320 mm über Bodenbezug;
- Messwert unter Referenz B: `-10 mm`;
- entspricht absolut 1.310 mm Wasserhöhe bzw. `+10 mm` relativ zu Referenz A.

## 3. Tatsächliches Wasservolumen

### 3.1 Zielgröße

Für spätere Dosierungs- und Bewertungsvorgänge ist nicht nur ein nominelles Poolvolumen interessant, sondern möglichst das **tatsächlich vorhandene Wasservolumen zum jeweiligen Zeitpunkt**.

Das Pro-Modell sollte zwei Größen sauber trennen:

1. **Basisvolumen `V0`** = Wasservolumen bei Wasserlinie `0 mm`;
2. **Volumenänderung `ΔV`** = Änderung des Volumens in Abhängigkeit von der Wasserlinie.

Grundbeziehung:

`V_aktuell = V0 + ΔV(Wasserlinie)`

### 3.2 Keine pauschale Grundfläche-×-Höhe-Annahme

Eine lineare Berechnung funktioniert nur bei entsprechend einfacher Beckengeometrie. Reale Pools können besitzen:

- Treppen;
- Sitzflächen;
- Rundungen;
- Schrägen;
- unterschiedliche Tiefen;
- höhenabhängig veränderliche Querschnitte.

Pro muss deshalb eine für den jeweiligen Pool geeignete Methode wählen können.

## 4. Beckengeometrie und Bestimmung von `V0`

Für PoolLog4U Pro soll eine abgestufte Erfassung der Beckengeometrie vorgesehen werden.

### 4.1 Einfache Becken

Mögliche Angaben:

- Innenlänge;
- Innenbreite;
- Wasserhöhe bei Referenz `0`;
- gegebenenfalls gleichmäßige Bodentiefe.

### 4.2 Becken mit unterschiedlichen Tiefen

Zusätzlich beispielsweise:

- flache Tiefe;
- tiefe Tiefe;
- Länge und Lage von Übergängen oder Gefällen.

### 4.3 Komplexere Becken

Zusätzlich je nach Form:

- Treppenmaße;
- Sitzbänke;
- Radien/Rundungen;
- Schrägen;
- sonstige Sonderformen.

### 4.4 Fotos und visuelle Unterstützung

Pro kann Fotos bzw. Abbildungen des Beckens zusammen mit Maßen verwenden, um die Geometrie leichter zu erfassen und ein Volumenmodell aufzubauen. Fotoanalyse ist eine Pro-Funktion und nicht Bestandteil von Mini.

## 5. Empirische Kalibrierung über Wasserstand und Wassermenge

### 5.1 Grundidee

Wenn bei einer Wasserzugabe oder -entnahme sowohl die Wasserlinienänderung als auch die Wassermenge bekannt sind, entsteht ein realer Kalibrierpunkt des individuellen Beckens.

Beispiel:

- vorher `-80 mm`;
- nachher `-22 mm`;
- zugeführt 1.000 l;
- damit entsprechen in diesem Bereich 58 mm Wasserstandsänderung ungefähr 1.000 l.

### 5.2 Kalibrierkennlinie statt zwingend konstantem Liter/mm-Faktor

Bei komplexer Geometrie kann sich Liter/mm mit der Wasserhöhe ändern. Deshalb soll Pro langfristig eine Kennlinie `Wasserlinie → Volumen` bzw. `Wasserlinienänderung → Volumenänderung` unterstützen und Zwischenwerte interpolieren können.

### 5.3 Theorie und reale Beobachtungen kombinieren

Ein geometrisch berechnetes Modell ist ein guter Ausgangspunkt. Reale Wasserzugaben/-entnahmen können es später bestätigen oder schrittweise kalibrieren. Einzelne ungenaue Werte sollen das Modell nicht übersteuern; mehrere konsistente Beobachtungen erhöhen dagegen die Verlässlichkeit.

## 6. Wassermenge: verschiedene Messmethoden und Unsicherheit

Ein Poolbesitzer verfügt nicht zwingend über eine separate Wasseruhr am Pool. Eine Hauswasseruhr kann durch gleichzeitige Verbraucher wie Gartenbewässerung verfälscht werden. Pro soll deshalb mehrere Quellen akzeptieren, beispielsweise:

- separater Wasser-/Schlauchzähler;
- Hauswasserzähler bei möglichst ausgeschlossenen Parallelverbrauchern;
- bekannte oder kalibrierte Schlauchdurchflussmenge × Zeit;
- bekannte Pumpen-/Förderleistung × Zeit;
- Hersteller-/Anlagenwerte;
- manuelle Schätzung;
- lediglich Wasserlinienänderung ohne Mengenangabe.

Wichtig: Der Benutzer darf auch ungefähr bekannte Mengen eingeben. Pro soll mit Unsicherheit arbeiten und keine Scheingenauigkeit verlangen.

Mögliches internes Qualitätsmodell:

- exakt bzw. direkt gemessen;
- aus Messwerten abgeleitet;
- gut geschätzt;
- grob geschätzt;
- unbekannt.

Diese Qualitätsklassifizierung gehört zur Pro-Auswertung; Mini soll den Benutzer damit nicht unnötig belasten.

## 7. Bereits in Mini entstehende wertvolle Kalibrierdaten

### 7.1 Teilwasseraustausch

Mini dokumentiert bereits:

- Wasserlinie vor Ablassen;
- Wasserlinie nach Ablassen;
- Wasserlinie nach Auffüllen;
- optional entfernte Wassermenge;
- optional zugeführte Wassermenge bzw. Wasseruhrwerte.

Diese Datensätze können später als empirische Kalibrierpunkte dienen.

### 7.2 Wasserfüllung

Die Post-Freeze-Erweiterung von Mini dokumentiert zusätzlich:

- Wasserlinie vor Auffüllen;
- Wasserlinie nach Auffüllen;
- optional zugeführte Wassermenge, intern normiert auf Liter.

Mini bewertet die Genauigkeit dieser Menge nicht. Pro kann die historischen Angaben später entsprechend ihrer Herkunft und Plausibilität verwenden.

## 8. Poolvolumen als Stammdatum

Das bestehende Mini-Feld `pools.volume_m3` ist fachlich nicht als exaktes tatsächliches Volumen definiert. Pro muss später unterscheiden können zwischen beispielsweise:

- Hersteller-/Nennvolumen;
- geschätztem Volumen;
- Volumen beim normalen Wasserstand;
- geometrisch berechnetem `V0`;
- kalibriertem `V0`;
- aktuell berechnetem Wasservolumen.

Bestehende Mini-Werte dürfen deshalb später nicht stillschweigend als eine dieser präziseren Größen umgedeutet werden.

## 9. Chemische Empfehlungen und Prozesslogik

PoolLog4U Pro soll Empfehlungen nicht als isolierte Einzelwerte erzeugen, sondern prozessbasiert.

Ein späterer Empfehlungsprozess kann enthalten:

1. relevante Vorbedingungen prüfen;
2. fehlende oder unsichere Daten erkennen;
3. Abhängigkeiten zwischen Wasserwerten berücksichtigen;
4. Zielbereich definieren;
5. gegebenenfalls stufenweise Korrektur empfehlen;
6. Produkt und tatsächliches Wasservolumen berücksichtigen;
7. Dosierung berechnen;
8. Warte-/Umlaufzeit berücksichtigen;
9. gezielte Nachmessung verlangen;
10. Folgeentscheidung aus neuem Messwert ableiten.

Beispielprinzip bei erhöhtem pH: TA, aktuelles Volumen, Zielwert und eingesetztes Produkt werden berücksichtigt; gegebenenfalls wird nicht sofort auf den endgültigen Zielwert korrigiert, sondern in sinnvollen Stufen mit Nachmessung gearbeitet.

## 10. Produktsystem für Pro

Der spätere zentrale Produktkatalog kann gegenüber Mini deutlich umfangreicher sein und beispielsweise enthalten:

- Hersteller;
- Produktname;
- Produktart;
- Darreichungsform;
- Wirkstoff/Inhaltsstoffe;
- Konzentration/Wirkgrad;
- Hersteller-Dosierangaben;
- Bezugsgröße, z. B. pro 10 m³;
- Auswirkungen auf andere Wasserparameter;
- Anwendungs- und Sicherheitshinweise.

Neben Chlor- und pH-/TA-Produkten sollen später unter anderem auch berücksichtigt werden können:

- Algizide;
- Flockmittel;
- Reinigungsmittel;
- weitere relevante Poolpflegeprodukte.

Mini bleibt bei einem benutzereigenen Dokumentationskatalog; Pro kann einen vorbefüllten, fachlich gepflegten Katalog erhalten.

## 11. Wechselwirkungen und Sicherheitslogik

Pro soll gefährliche oder fachlich ungünstige Kombinationen erkennen und vor zu dicht aufeinanderfolgenden Chemiezugaben warnen. Beispiel: Calciumhypochlorit und pH-Senker dürfen nicht unkritisch gleichzeitig bzw. unmittelbar gemeinsam eingesetzt werden.

Die Empfehlung muss nicht nur eine Menge nennen, sondern auch Reihenfolge, Abstand und erforderliche Nachkontrolle berücksichtigen.

## 12. Historische Daten und Rückwärtskompatibilität

Grundsatz für die Weiterentwicklung:

- historische Primärdaten nicht überschreiben;
- Referenzsysteme versionieren;
- spätere Stammdaten nach Möglichkeit rückwirkend auf historische Daten anwenden können;
- zwischen tatsächlich gemessenen, berechneten und geschätzten Größen unterscheiden;
- Unsicherheit explizit modellieren, wenn sie fachlich relevant ist;
- Mini-Daten nicht nachträglich präziser erscheinen lassen, als sie ursprünglich waren.

## 13. UX-Grundsätze für Pro

- progressive Erfassung statt eines überladenen Pflichtformulars;
- einfache Pools mit wenigen Angaben vollständig abbilden;
- komplexe Geometrie nur dann detailliert abfragen, wenn sie tatsächlich vorhanden ist;
- vorhandene Informationen nutzen, auch wenn sie unvollständig oder ungefähr sind;
- dem Benutzer keine unnötige Messpflicht auferlegen;
- Genauigkeit dort erhöhen, wo sie Entscheidungen tatsächlich verbessert.

## 14. Offene Architekturfragen

Noch zu entscheiden bzw. später zu spezifizieren:

- genaue Definition des geometrischen Bodenbezugs bei komplexen Becken;
- Datenmodell für versionierte Wasserlinien-Referenzen;
- Repräsentation und Interpolation der Wasserstand-Volumen-Kennlinie;
- Verfahren zur Gewichtung verschiedener Kalibrierpunkte nach Messqualität;
- Umgang mit Verdunstung, Regen, Badebetrieb und gleichzeitigem Wasserverlust während längerer Füllvorgänge;
- Auswahl geeigneter Geometriemodelle für Standardbecken;
- Umfang und Datenschutzrahmen einer späteren Fotoanalyse;
- Migrationspfad von Mini-Stammdaten und Mini-Ereignissen in das Pro-Datenmodell.

---

**Pflegehinweis:** Neue Pro-Ideen und bereits beschlossene Pro-Konzepte sollen künftig zuerst thematisch in diese Datei eingeordnet werden, bevor sie in konkrete Pro-Backlogs, Datenmodelle oder Implementierungen überführt werden.
