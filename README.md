# FreePoolLog4U Mini

**Aktuelle Version: 1.0.0-beta.4**

Pilotversion für einen geschlossenen externen Betatest mit bis zu 20 Personen.

## Datenhaltung

- Supabase Auth für E-Mail/Passwort
- `pools` als poolspezifische Stammdaten
- `events` als zentraler Masterbestand
- Row Level Security trennt Benutzerbestände
- primäre Supabase-Datenbank: Central EU (Frankfurt)

## Sicherung

- CSV: Rohdatenexport der 21 Ereignisspalten
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

## Bewusst noch nicht enthalten

- Mehrpool-Auswahl in der UI
- Offline-Synchronisierung
- automatische Bewertung der Wasserchemie oder Dosierungsberatung
- Pro-Funktionen, Subscription, KI, Wissen, Empfehlungen oder Fotoanalyse
