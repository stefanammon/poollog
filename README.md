# FreePoolLog4U Mini

**Aktuelle Version: 1.0.0-beta.5**

Pilotversion für einen geschlossenen externen Betatest mit bis zu 20 Personen.

## Datenhaltung

- Supabase Auth für E-Mail/Passwort
- `pools` als poolspezifische Stammdaten
- `events` als zentraler Masterbestand
- Row Level Security trennt Benutzerbestände
- primäre Supabase-Datenbank: Central EU (Frankfurt)

## Sicherung

- CSV: Rohdatenexport aller strukturierten Ereignisfelder
- CSV-Export auch für einen frei wählbaren Zeitraum
- JSON: Ereignisse plus Pool-Stammdaten
- Import/Wiederherstellung sind in Mini bewusst nicht in der normalen UI verfügbar

## Release-Historie

### 1.0.0-beta.1
- Login, Registrierung, Passwort-Reset und Logout
- Erstanlage eines Pools nach Registrierung
- zentrale Ereignisse und Stammdaten auf PC und Smartphone
- Mess- und Intervalllogik
- CSV- und JSON-Sicherung

### 1.0.0-beta.2
- zuverlässiger Passwort-Recovery-Ablauf
- konsistenter Kopfbereich mit Poolname und optionalem Benutzerkürzel
- redundante Seitenüberschriften reduziert
- neutraler Kürzel-Platzhalter
- automatische Aktualisierung beim Zurückkehren zur App bzw. zum Browserfenster

### 1.0.0-beta.3
- professioneller Eröffnungsscreen mit „Einfach · Sicher · Kristallklar“
- AMMON-Markenmotiv im Splash-Screen
- neue blaue Markenwelt mit Wellenmotiv

### 1.0.0-beta.4
- Vorbereitung für den ersten externen Betatest
- Datenschutzinformation, Impressum und Beta-Hinweise dauerhaft erreichbar
- Datenschutzhinweis direkt bei der Registrierung
- einmaliger Beta-Hinweis beim ersten authentifizierten Einstieg je Nutzer und Gerät
- direkter Feedback-Zugang per E-Mail
- zentrale Versionsdefinition für App und PWA-Cache
- fehlendes PWA-Icon im Release-Paket ergänzt
- Registrierung mit eindeutiger Eingabehilfe und sichtbarem Wartezustand
- Reinigungsarten pro Pool frei konfigurierbar; keine Sammelkategorien

### 1.0.0-beta.5
- Wasserpflege als strukturierte Aktionen mit Produkt, Menge und Einheit
- benutzereigener Produktkatalog mit Bearbeiten sowie Aktivieren/Deaktivieren
- historische Produkt-Snapshots bleiben bei späteren Stammdatenänderungen unverändert
- Teilwasseraustausch mit Wasserlinie vor Ablassen, nach Ablassen und nach Auffüllen
- Plausibilitätsprüfung und direkte Eingabe negativer Wasserlinienwerte
- strukturierte Beckenbefunde mit mehreren Befunden und mehreren Fundorten je Ereignis
- Messwert-Historie zeigt vorhandene Zustandswerte unabhängig vom Ereignistyp
- CSV- und JSON-Export um Wasserpflege, Produkte, Wasseraustausch und Beckenbefunde erweitert


### Notwendige Post-Freeze-Ergänzungen zu 1.0.0-beta.5 (15.08.2026)
- Wasserlinien-0-Marke wird pro Pool einmal verbindlich bestätigt und ist danach in Mini nicht mehr änder- oder löschbar
- serverseitiger DB-Trigger schützt die bestätigte Wasserlinien-Referenz zusätzlich gegen spätere Änderung
- Wasserfüllung dokumentiert optional Wasserlinie vor und nach dem Auffüllen sowie die zugeführte Wassermenge
- Wasserfüllungsmenge wird intern in Litern normalisiert und in CSV/JSON erhalten
- Pro-relevante Architektur- und Fachkonzepte werden fortlaufend in `docs/POOLLOG4U_PRO_KONZEPT.md` dokumentiert
- Versionsbezeichnung bleibt bewusst `1.0.0-beta.5`

### UX-Überarbeitung Messungs-Formular zu 1.0.0-beta.5 (19.08.2026) – abgeschlossen und getestet
- reine Präsentationsebene, keine Änderung an Datenmodell, Validierung oder Exportformaten
- Messungs-Formular in sichtbare Bereiche gegliedert (Werte, Chemie erweitert, Umgebung, Zeitraum, Optik & Befund) statt einer langen Einzelseite
- sticky Sprungleiste zu den Bereichen sowie Fortschrittsanzeige „X/13 Felder“, um die von Mini angestrebte möglichst vollständige Datenerfassung zu unterstützen
- Zahnrad-Buttons an den Intervallfeldern (Dach, Badebetrieb, Pumpe, Chlorschwimmer) springen direkt zum passenden Stammdaten-Vorschlag; Rücksprung über „Zurück“ oder „Speichern“ führt unabhängig vom Einstiegspunkt zur Ausgangsansicht zurück
- Details in `docs/MINI_UX_MESSUNGSFORMULAR_20260819.md`

### Technische Optimierungen zu 1.0.0-beta.5 (19.08.2026) – abgeschlossen und getestet
- Suche in „Alle Einträge“ nutzt einen clientseitigen Datencache und ist auf 250 ms debounced statt bei jedem Tastendruck neu vom Server zu laden
- automatische Aktualisierung bei Fokus-/Sichtbarkeitswechsel (`refreshCentralData()`) lädt nur noch bei tatsächlicher Datenänderung (leichtgewichtiges Änderungssignal aus Anzahl/Zeitstempel) den vollständigen Bestand neu
- Uhrzeit ist jetzt für jeden Eintrag Pflichtfeld, damit die Intervalllogik zuverlässig greift
- blockierender Bestätigungsdialog beim Speichern, falls für Datum+Uhrzeit bereits ein anderer Eintrag existiert; bei Abbruch wird die Eingabemaske vollständig auf den Zustand einer neuen Messmaske zurückgesetzt
- Speichern-Button wird während des Speichervorgangs deaktiviert und zeigt einen Ladezustand, um Doppel-Submits zu verhindern
- Fehlermeldungen erscheinen zusätzlich zum Toast dauerhaft und in verständlichem Deutsch in einem `aria-live`-Bereich im Formularbereich
- Menü-Button auf 48×48px vergrößert; sichtbarer Fokusring für Eingabefelder verstärkt
- Details in `docs/MINI_TECH_OPTIMIERUNGEN_20260819.md`

## Bewusst noch nicht enthalten

- Mehrpool-Auswahl in der UI
- Offline-Synchronisierung
- automatische Bewertung der Wasserchemie oder Dosierungsberatung
- Pro-Funktionen, Subscription, KI, Wissen, Empfehlungen oder Fotoanalyse


## Einmalige Datenbankmigration für die Post-Freeze-Ergänzungen
Vor dem Deployment dieses Stands einmalig `SUPABASE_BETA5_WATERLINE_REFERENCE_REFILL.sql` im Supabase SQL Editor ausführen. Die Migration ergänzt nur bestehende Tabellen (`pools`, `events`) und verwendet weiterhin deren vorhandene RLS-Policies.

Die früheren Beta-4-Migrationen bleiben Bestandteil der bereits bestehenden Datenbankbasis.

## Beta 4 – Mehrfachauswahl Reinigung

Für Reinigungsvorgänge können mehrere konkrete Reinigungsarten gleichzeitig ausgewählt werden.
Die Zuordnung wird normalisiert in `event_cleaning_types` gespeichert; historische Bezeichnungen bleiben als Snapshot erhalten.

Vor dem Deployment dieses Stands einmalig im Supabase SQL Editor ausführen:

`SUPABASE_BETA4_MULTIPLE_CLEANING_TYPES.sql`

Das Skript übernimmt vorhandene Einzel-Reinigungen in das neue Modell und setzt die erforderlichen RLS-Policies und GRANT-Rechte.
