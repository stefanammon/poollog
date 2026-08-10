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
