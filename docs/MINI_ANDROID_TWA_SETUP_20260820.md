# FreePoolLog4U Mini – Android-TWA-Setup für den Play Store

**Stand:** 20.08.2026 (final für diesen Meilenstein)
**Version:** Mini Version 1.0.0-beta.5 (unverändert); TWA-Paketversion `1.0.0.0` / Version Code `1`
**Status:** Interner Test erfolgreich abgeschlossen – TWA verifiziert (kein Browser-Balken), Digital Asset Links vollständig (Upload-Key + App-Signaturschlüssel), Funktionscheck auf echtem Gerät bestanden. Kein produktiver Play-Store-Release ohne ausdrückliche Freigabe des Poolbetreibers.

## 1. Rahmenbedingung

FreePoolLog4U Mini ist eine fertige, getestete PWA im Release-/Feature-Freeze (siehe `docs/MINI_TECH_OPTIMIERUNGEN_20260819.md`, `docs/MINI_POST_FREEZE_CHANGES_BETA5.md`). Dieses Dokument beschreibt ausschließlich den **Vertriebs-/Distributionsschritt** über einen Trusted-Web-Activity-Wrapper (TWA) für den Google Play Store. Es wurden **keine Änderungen** an `app.js`, an der UI, am Datenmodell, an der Validierung oder am Supabase-Backend vorgenommen. Kein iOS-Wrapper, keine In-App-Purchases, keine Änderung der Produktversion `1.0.0-beta.5`.

## 2. Getroffene Entscheidungen

| Punkt | Entscheidung |
|---|---|
| Package-Name (Application ID) | `de.ammon.freepoollog4u.mini` – reverse-domain mit `.mini`-Suffix, kollisionsfrei zu einer möglichen späteren Pro-App |
| App-Signing | Play App Signing (von Google verwaltet); lokaler Upload-Key via PWABuilder erzeugt |
| Play-Console-Konto | vorhanden, privates Konto, Kontoinhaber „Stefan Ammon", Identitätsprüfung von Google abgeschlossen |
| Entwicklername (öffentlich im Store sichtbar) | „Stefan Ammon" – unkritisch, da das Impressum in der App ohnehin Klarnamen und Adresse zeigt |
| Build-Werkzeug | PWABuilder (pwabuilder.com), erster Durchlauf ohne lokales Bubblewrap-Setup |
| TWA-Fallback-Verhalten | Custom Tabs (statt Web View) |
| Google Play Billing | deaktiviert (Mini bleibt kostenlos, keine Store-Zahlungsanbindung) |
| Notification/Location delegation | Notification: aktiviert (PWABuilder-Standard); Location: deaktiviert |

## 3. Verifikation der GitHub-Pages-Struktur

Produktions-URL bestätigt: `https://stefanammon.github.io/poollog/` (GitHub-Pages-Projektseite im Repository `poollog`).

Für die Digital-Asset-Links-Datei (`assetlinks.json`), die zwingend an der Domain-Wurzel liegen muss, existierte noch kein GitHub-User-Pages-Repository. Es wurde neu angelegt:

- Repository: `https://github.com/stefanammon/stefanammon.github.io` (exakter Name erforderlich für automatische Pages-Auslieferung an der Domain-Wurzel)
- Pages-Quelle: „Deploy from a branch“, Branch `main`, Ordner `/ (root)`
- Enthält aktuell: `README.md`, `.nojekyll`, `.well-known/assetlinks.json`

**Wichtige Falle:** GitHub Pages verarbeitet Inhalte standardmäßig über Jekyll, welches Punkt-Ordner (u. a. `.well-known/`) beim Build ignoriert – Ergebnis war ein 404 trotz korrekt committeter Datei. Fix: leere Datei `.nojekyll` im Repository-Root, schaltet die Jekyll-Verarbeitung aus und liefert alle Dateien unverändert aus.

Ein Root-Index (`index.html`) ist im Repository `stefanammon.github.io` bewusst **nicht** vorhanden; `https://stefanammon.github.io/` antwortet daher weiterhin mit 404. Das ist unkritisch, da ausschließlich `.well-known/assetlinks.json` benötigt wird.

## 4. Datenschutz-URL

Die bisherige Datenschutzinformation lag nur als In-App-Modal (`<template id="privacyTemplate">` in `index.html`) vor – ohne eigenständig aufrufbare URL, wie von der Play Console für den Store-Eintrag gefordert.

Neu angelegt: `datenschutz.html` im Repository `poollog` (Repository-Root, neben `index.html`), Text 1:1 aus dem bestehenden Modal übernommen. Live unter:

`https://stefanammon.github.io/poollog/datenschutz.html`

## 5. Android-Paket (PWABuilder)

Erzeugt über pwabuilder.com mit Quelle `https://stefanammon.github.io/poollog/` (liest `manifest.webmanifest`). Relevante Einstellungen im Android-Package-Dialog:

- Package ID: `de.ammon.freepoollog4u.mini`
- App name: `FreePoolLog4U Mini` / Short name: `FreePoolLog4U`
- Host: `stefanammon.github.io`, Start URL: `/poollog/`
- Version: `1.0.0.0`, Version Code: `1`
- Theme Color `#ffffff`, Background Color `#f7f9fc` (aus Manifest übernommen)
- Signing key: „New“ (PWABuilder-generierter Upload-Keystore), Key alias `freepoollog4u-mini`, Country Code `DE`
- Fallback behavior: Custom Tabs
- Google Play Billing: deaktiviert

Download enthält: `app-release-bundle.aab`, `signing.keystore`, `signingkeyinfo.txt` (Keystore-Passwort im Klartext – sicher verwahren, z. B. Passwortmanager; ohne diese Datei sind spätere Updates der App nicht mehr möglich), sowie eine vorgefertigte `assetlinks.json`.

## 6. Digital Asset Links (`assetlinks.json`)

**Finaler Inhalt** (Upload-Key-Fingerabdruck + Play-App-Signing-Fingerabdruck):

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "de.ammon.freepoollog4u.mini",
    "sha256_cert_fingerprints": [
      "BB:72:45:B8:39:89:81:80:75:F1:7D:DE:6F:DA:5A:1F:D3:B1:D8:9C:2C:21:A0:81:FD:C2:FC:20:AA:D5:01:61",
      "F3:26:20:CA:C1:AC:3C:5A:B7:ED:3A:37:54:8F:9D:A4:D4:1C:C3:A8:8C:63:D4:E0:DA:2F:C4:22:95:5A:F6:E7"
    ]
  }
}]
```

- Erster Fingerabdruck = Uploadschlüssel (lokal von PWABuilder generiert)
- Zweiter Fingerabdruck = App-Signaturschlüssel (von Google verwaltet, Play App Signing). Fundort in der Play Console: *App-Eintrag → Mit Google Play geschützt → Google Play Store-Schutz → „App-Signaturschlüssel schützen" → „Play App-Signatur verwalten"* (Navigation wurde von Google zwischenzeitlich mehrfach umbenannt/verschoben, ursprünglich unter „Setup → App-Integrität").
- Zugehöriger SHA-1-Fingerabdruck des App-Signaturschlüssels (aktuell nicht in `assetlinks.json` benötigt, nur zur Referenz notiert): `D4:52:35:B0:4D:F8:0E:D1:9E:C4:4B:04:C7:63:93:F9:50:F6:34:D5`

Live und verifiziert unter `https://stefanammon.github.io/.well-known/assetlinks.json` (beide Fingerabdrücke bestätigt, Stand 20.08.2026).

## 7. Store-Listing-Icon

`icon-512.png` enthält einen echten Alphakanal (transparente Bereiche außerhalb der eingebackenen abgerundeten Form) – Play verlangt für das Store-Icon ein deckendes PNG. Es wurde eine geflachte Variante mit weißem Hintergrund erzeugt und vom Poolbetreiber als finale Store-Icon-Version bestätigt. Die Rundung ist im Ausgangsdesign bereits eingebacken; dadurch entsteht ein sichtbarer weißer Rand um die Form (bewusst akzeptiert, keine Neugestaltung des Icons im Rahmen dieser Aufgabe).

## 8. Store-Listing-Assets (fertig)

Alle für das Store-Listing benötigten Materialien sind erstellt und liegen bereit zum Eintragen in die Play Console, sobald die Kontoeinrichtung abgeschlossen ist:

- Feature-Grafik 1024×500 (Farbverlauf/Wellenmotiv passend zur bestehenden Markenwelt, Icon freigestellt eingebettet, Slogan „Einfach · Sicher · Kristallklar" aus dem bestehenden Splash-Screen übernommen)
- Kurzbeschreibung (74 Zeichen) und Langbeschreibung (~1.580 Zeichen), beta-spezifische Formulierungen entfernt, Positionierungssatz „Mini dokumentiert. Es dosiert nicht. Es berät nicht." als Eröffnung
- 4 Smartphone-Screenshots vom Poolbetreiber bereitgestellt (Messungs-Formular, Messwert-Historie, letzte Einträge, Menü/Export) – empfohlene Reihenfolge: Formular → Historie → Einträge → Menü
- Datenschutz-Link: `https://stefanammon.github.io/poollog/datenschutz.html`

## 9. Play-Console-Kontoeinrichtung und interner Test

Entwicklerkonto wurde als **privates Konto** unter dem Namen „Stefan Ammon" angelegt. Die Google-Identitätsprüfung (Ausweisdokument, Android-Gerät, Kontakttelefonnummer) ist **abgeschlossen**.

Ablauf des internen Tests:

1. ✅ App in der Play Console angelegt mit Package-Name `de.ammon.freepoollog4u.mini`
2. ✅ Interner Testtrack eingerichtet, Tester-E-Mail-Liste „Tester1" (enthält `s.ammon.login@gmail.com`)
3. ✅ `FreePoolLog4U Mini.aab` hochgeladen (Version 1, `1.0.0.0`, 1.57 MB, API-Level 23+, Ziel-SDK 36)
4. ✅ Release veröffentlicht – keine zusätzlichen Pflichtangaben (Content-Rating, Data-Safety-Formular) verlangt
5. ✅ Installation auf echtem Android-Gerät über den „Testern beitreten"-Link. Stolperstein dabei: Auf dem Testgerät war zunächst ein anderes Google-Konto aktiv als das aus der Tester-Liste – nach Anmeldung mit dem richtigen Konto (`s.ammon.login@gmail.com`) funktionierte die Einladung und Installation reibungslos.
6. ✅ **Kernprüfung bestanden:** App startet ohne Browser-Adressleiste – die Digital-Asset-Links-Verifizierung greift.
7. ✅ Play-App-Signing-Fingerabdruck ermittelt und `assetlinks.json` um zweiten Eintrag ergänzt (siehe Abschnitt 6)
8. ✅ **Funktionscheck bestanden:** Messformular, Messwert-Historie, Speichern und weitere Kernfunktionen innerhalb der TWA getestet – Supabase-Anbindung und alle Funktionen laufen wie in der Browser-PWA.

Damit ist der interne Test vollständig und erfolgreich abgeschlossen.

**Hinweis zu Interne App-Freigabe:** Play Console bietet neben dem regulären internen Testtrack auch „Interne App-Freigabe" (Internal App Sharing) für sofortige, prüfungsfreie Verteilung von Testbuilds. Dabei signiert Google das Paket jedoch mit einem separaten, geteilten Test-Zertifikat – nicht mit dem echten Upload- oder App-Signaturschlüssel. Für die TWA-Kernprüfung (kein Browser-Balken) ist dieser Verteilweg daher **nicht geeignet**, da der Fingerabdruck nicht zu `assetlinks.json` passt. Nur der reguläre interne Testtrack liefert ein aussagekräftiges Ergebnis für die Digital-Asset-Links-Verifizierung.

## 10. Offene Punkte

- Setup-Doku ist mit diesem Stand abgeschlossen für den Meilenstein „interner Test"
- **Kein produktiver Play-Store-Release ohne ausdrückliche Freigabe des Poolbetreibers** – der interne Test ist erfolgreich, die Entscheidung über den offenen/Produktions-Track liegt beim Poolbetreiber und ist bewusst nicht automatisch ausgeführt worden

## 11. Durchgeführte Prüfungen

| Prüfung | Ergebnis |
|---|---|
| `https://stefanammon.github.io/poollog/` live, Version beta.5 bestätigt | PASS |
| `datenschutz.html` live und inhaltlich korrekt | PASS |
| `icon-512.png` Alphakanal-Prüfung (Python/Pillow) | Transparenz bestätigt, deckende Variante erzeugt |
| `https://stefanammon.github.io/.well-known/assetlinks.json` live, valides JSON mit korrektem Package-Namen und beiden Fingerabdrücken (Upload-Key + App-Signaturschlüssel) | PASS |
| Installation über internen Testtrack auf echtem Android-Gerät | PASS |
| TWA-Verifizierung (kein Browser-Balken beim App-Start) | PASS |
| Funktionscheck innerhalb der TWA (Messformular, Historie, Speichern) | PASS |
| Play-Console-Store-Listing vollständig | PASS (keine zusätzlichen Pflichtangaben von Google verlangt) |
