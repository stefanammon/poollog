# FreePoolLog4U Mini 1.0 Beta 1

Pilotversion für eine kleine externe Testergruppe.

## Datenhaltung

- Supabase Auth für E-Mail/Passwort
- `pools` als poolspezifische Stammdaten
- `events` als zentraler Masterbestand
- Row Level Security trennt Benutzerbestände
- IndexedDB wird in dieser Version nicht mehr als Masterbestand verwendet

## Sicherung

- CSV: reiner Rohdatenexport der 21 Ereignisspalten
- JSON: Ereignisse plus Pool-Stammdaten
- Import/Wiederherstellung sind in Beta 1 bewusst nicht in der normalen UI verfügbar

## Beta 1

- Login, Registrierung, Passwort-Reset und Logout
- Erstanlage eines Pools nach Registrierung
- zentrale Ereignisse auf PC und Smartphone
- zentrale Stammdaten
- bestehende Mess-/Intervalllogik erhalten
- sichtbarer Produktname und Versionsnummer auf der Startseite
- neue PWA-Cache-Version

## Noch nicht enthalten

- Mehrpool-Auswahl in der UI
- Offline-Synchronisierung
- Pro-Funktionen, Subscription, KI, Wissen, Empfehlungen, Fotos


## 1.0.0-beta.2
- Passwort-Recovery erkennt den Supabase-Recovery-Link zuverlässig und fordert ein neues Passwort zweimal an
- nach erfolgreichem Reset ist eine bewusste Neuanmeldung mit dem neuen Passwort erforderlich
- konsistenter Kopfbereich: FreePoolLog4U, Poolname und optional Benutzerkürzel, Mini-Version
- redundante Seitenüberschriften reduziert
- neutraler Kürzel-Platzhalter statt persönlichem Beispiel
- zentrale Daten werden beim Zurückkehren zur App bzw. zum Browserfenster automatisch neu geladen
- neue Cache-Version für den PWA-Rollout


## 1.0.0-beta.3
- neuer professioneller Eröffnungsscreen mit FreePoolLog4U, Mini und „Einfach · Sicher · Kristallklar“
- dezentes AMMON-Markenmotiv im Splash-Screen
- neue blaue Markenwelt mit Wellenmotiv; Unterseiten optisch daran angeglichen
- PWA-Cache auf Beta 3 angehoben
