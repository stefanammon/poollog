# FreePoolLog4U Mini 1.0.0-beta.5 – notwendige Änderungen nach Freeze

**Stand:** 15.08.2026  
**Version:** Mini Version 1.0.0-beta.5  
**Status:** umgesetzt, migriert und funktional geprüft

## 1. Rahmenbedingung

FreePoolLog4U Mini 1.0.0-beta.5 befindet sich grundsätzlich im Release-/Feature-Freeze. Die nachfolgend dokumentierten Änderungen wurden dennoch vorgenommen, weil ohne sie historische Wasserlinien- und Wasserfüllungsdaten für eine spätere Auswertung in PoolLog4U Pro an Aussagekraft verlieren könnten.

> **Mini dokumentiert. Mini berät und dosiert nicht.**

Es wurden keine Dosierungs-, Beratungs- oder Volumenberechnungsfunktionen in Mini aufgenommen.

## 2. Wasserlinien-Referenz / feste 0-Marke

Jeder Pool verwendet eine feste physische **0-Marke** als Referenz für alle Wasserlinienwerte.

- `0 mm` = Wasser genau auf Höhe der 0-Marke
- negative Werte = Wasser unterhalb der 0-Marke
- positive Werte = Wasser oberhalb der 0-Marke
- sinnvollerweise liegt die 0-Marke am normalen Wasserstand des Pools

Für Mini gilt: Die Referenz wird einmal bestätigt und danach nicht mehr geändert oder gelöscht. Bei bestehenden Pools bestätigt der Benutzer damit zugleich, dass bereits vorhandene Wasserlinienwerte auf derselben physischen Referenz beruhen.

### Technische Umsetzung

In `public.pools` wurde `waterline_reference_confirmed_at timestamptz` ergänzt. Ein PostgreSQL-Trigger verhindert nach dem erstmaligen Setzen jede spätere Änderung. Neue Wasserlinienwerte können in Mini erst gespeichert werden, nachdem die 0-Marke bestätigt wurde.

### Abgrenzung zu PoolLog4U Pro

PoolLog4U Pro darf später einen Wechsel der physischen Referenz ermöglichen. Eine bestehende Referenz wird dabei nicht überschrieben, sondern eine neue, zeitlich gültige Referenz angelegt und zur vorherigen Referenz in Beziehung gesetzt. Vorgesehen sind insbesondere Gültigkeitszeitraum, Versatz zur vorherigen Referenz, Höhe der 0-Marke über einem definierten Bodenbezug und Erhalt aller historischen Referenzen.

## 3. Erweiterte Dokumentation „Wasserfüllung“

Die Aktion **Wasserfüllung** dokumentiert jetzt:

- Wasserlinie vor dem Auffüllen,
- Wasserlinie nach dem Auffüllen,
- optional die zugeführte Wassermenge.

Die vorherige Wasserlinie wird nach Möglichkeit aus dem zuletzt bekannten Wasserlinienwert vorbelegt. Die Wassermenge kann in Liter oder m³ eingegeben werden und wird intern in Liter normalisiert. Eine Mengenangabe bleibt ausdrücklich optional.

In `public.events` wurden `waterline_before_mm numeric` und `water_added_volume_l numeric` ergänzt. `NULL` ist für die Wassermenge zulässig; ein vorhandener Wert muss größer als `0` sein. Wenn Vorher- und Nachher-Wasserlinie erfasst sind, wird plausibilisiert, dass der Wasserstand nach einer Wasserfüllung höher liegt.

## 4. Darstellung der Wasserfüllung

Verbindliche Darstellung, sofern alle Werte vorhanden sind:

```text
Wasserlinie vorher: -38 mm · Auffüllung: 500 l · Wasserlinie nachher: +3 mm
```

Positive Wasserlinienwerte werden mit `+` dargestellt. Fehlt die optionale Wassermenge, wird der entsprechende Teil weggelassen. Die Darstellung ist in **Letzte Einträge** und **Alle Einträge** konsistent.

## 5. Export und Backup

Die zusätzlichen Wasserfüllungsdaten bleiben in den vorhandenen Sicherungswegen erhalten.

### CSV – geprüfter Testdatensatz 15.08.2026, 14:55 Uhr

- Aktion: `Wasserfüllung`
- Wasserlinie: `3 mm`
- Wasserlinie vorher: `-38 mm`
- Wasserlinie nach Auffüllen: `3 mm`
- zugeführtes Wasser: `500 l`

### JSON-Backup

Der gleiche Wasserfüllungsdatensatz ist vollständig im JSON-Backup enthalten. Zusätzlich wird die bestätigte Wasserlinien-Referenz in den Pool-Stammdaten gesichert.

## 6. PWA-Cache

Während des Tests zeigte sich, dass eine aktualisierte `app.js` trotz erfolgreichem Deployment zunächst nicht ausgeliefert wurde, weil innerhalb derselben App-Version noch derselbe Service-Worker-Cache verwendet wurde.

Der Cache des Service Workers wurde deshalb gezielt hochgezählt, ohne die Produktversion zu ändern.

**Für weitere notwendige Änderungen innerhalb von `1.0.0-beta.5`:** Auch bei unveränderter App-Version muss der PWA-Cache angepasst werden, wenn geänderte statische Dateien zuverlässig an bereits installierte PWAs ausgeliefert werden sollen.

## 7. Supabase-Migration

Die Migration wurde am 15.08.2026 im produktiven Supabase-Projekt erfolgreich ausgeführt.

Datei: `SUPABASE_BETA5_WATERLINE_REFERENCE_REFILL.sql`

Sie ergänzt:

- `pools.waterline_reference_confirmed_at`
- `events.waterline_before_mm`
- `events.water_added_volume_l`
- CHECK-Constraint für positive zugeführte Wassermengen
- Trigger/Funktion zur Unveränderlichkeit der bestätigten Mini-Referenz

Es wurden keine neuen Tabellen angelegt. Die vorhandenen RLS-Strukturen für `pools` und `events` bleiben maßgeblich.

## 8. Durchgeführte Funktionstests

| Test | Ergebnis |
|---|---|
| 0-Marke bei bestehendem Pool einmalig bestätigen | PASS |
| 0-Marke danach nicht mehr änderbar/löschbar | PASS |
| Wasserfüllung mit Vorher-/Nachher-Wasserlinie speichern | PASS |
| optionale Wassermenge, Testwert 500 l | PASS |
| Darstellung „Letzte Einträge“ | PASS |
| Darstellung „Alle Einträge“ | PASS |
| CSV-Export | PASS |
| JSON-Backup einschließlich Referenz | PASS |

Testbeispiel: `Wasserlinie vorher: -38 mm · Auffüllung: 500 l · Wasserlinie nachher: +3 mm`

## 9. Bewusst nicht in Mini umgesetzt

PoolLog4U Pro vorbehalten bleiben:

- Berechnung des tatsächlichen Wasservolumens und `V0`,
- detaillierte Beckengeometrie einschließlich Treppen, Sitzflächen, Rundungen und Schrägen,
- Fotoauswertung zur Unterstützung der Beckenmodellierung,
- Wasserstand-/Volumen-Kennlinien,
- Kalibrierung aus realen Wasserzugaben oder -entnahmen,
- Bewertung unterschiedlicher Messgenauigkeiten,
- versionierte Änderung der Wasserlinien-Referenz,
- Dosierungs- und Handlungsempfehlungen.

Die hierzu erarbeiteten Konzepte werden zentral in `docs/POOLLOG4U_PRO_KONZEPT.md` weitergeführt.

## 10. Freeze-Status nach Abschluss

Die hier dokumentierten notwendigen Änderungen sind abgeschlossen und getestet.

**FreePoolLog4U Mini 1.0.0-beta.5 befindet sich wieder im Release-/Feature-Freeze.**

Weitere Änderungen an Mini erfolgen nur, wenn im externen Betatest ein fachlich oder technisch notwendiger Änderungsbedarf festgestellt wird.
