# FreePoolLog4U Mini – Android-TWA-Setup für den Play Store

**Stand:** 20.08.2026
**Version:** Mini Version 1.0.0-beta.5 (unverändert); TWA-Paketversion `1.0.0.0` / Version Code `1`
**Status:** In Arbeit – Digital Asset Links live und verifizierbar, alle Store-Listing-Assets fertig; Play-Console-Store-Listing und interner Test blockiert durch laufende Google-Identitätsprüfung (Stand 20.08.2026)

## 1. Rahmenbedingung

FreePoolLog4U Mini ist eine fertige, getestete PWA im Release-/Feature-Freeze (siehe `docs/MINI_TECH_OPTIMIERUNGEN_20260819.md`, `docs/MINI_POST_FREEZE_CHANGES_BETA5.md`). Dieses Dokument beschreibt ausschließlich den **Vertriebs-/Distributionsschritt** über einen Trusted-Web-Activity-Wrapper (TWA) für den Google Play Store. Es wurden **keine Änderungen** an `app.js`, an der UI, am Datenmodell, an der Validierung oder am Supabase-Backend vorgenommen. Kein iOS-Wrapper, keine In-App-Purchases, keine Änderung der Produktversion `1.0.0-beta.5`.

## 2. Getroffene Entscheidungen

| Punkt | Entscheidung |
|---|---|
| Package-Name (Application ID) | `de.ammon.freepoollog4u.mini` – reverse-domain mit `.mini`-Suffix, kollisionsfrei zu einer möglichen späteren Pro-App |
| App-Signing | Play App Signing (von Google verwaltet); lokaler Upload-Key via PWABuilder erzeugt |
| Play-Console-Konto | vorhanden |
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

Inhalt (Upload-Key-Fingerabdruck, von PWABuilder generiert):

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "de.ammon.freepoollog4u.mini",
    "sha256_cert_fingerprints": ["BB:72:45:B8:39:89:81:80:75:F1:7D:DE:6F:DA:5A:1F:D3:B1:D8:9C:2C:21:A0:81:FD:C2:FC:20:AA:D5:01:61"]
  }
}]
```

Live und verifiziert unter `https://stefanammon.github.io/.well-known/assetlinks.json`.

**Offener Nachtrag:** Nach dem ersten Upload des `.aab` in die Play Console liefert Google unter *Setup → App-Integrität → App-Signaturschlüssel-Zertifikat* einen zusätzlichen SHA-256-Fingerabdruck (Play-App-Signing-Zertifikat, unterscheidet sich vom lokalen Upload-Key). Dieser sollte als zweiter Eintrag im `sha256_cert_fingerprints`-Array ergänzt werden, damit die TWA-Verifizierung auch nach der Google-seitigen Neusignierung zuverlässig funktioniert.

## 7. Store-Listing-Icon

`icon-512.png` enthält einen echten Alphakanal (transparente Bereiche außerhalb der eingebackenen abgerundeten Form) – Play verlangt für das Store-Icon ein deckendes PNG. Es wurde eine geflachte Variante mit weißem Hintergrund erzeugt und vom Poolbetreiber als finale Store-Icon-Version bestätigt. Die Rundung ist im Ausgangsdesign bereits eingebacken; dadurch entsteht ein sichtbarer weißer Rand um die Form (bewusst akzeptiert, keine Neugestaltung des Icons im Rahmen dieser Aufgabe).

## 8. Store-Listing-Assets (fertig)

Alle für das Store-Listing benötigten Materialien sind erstellt und liegen bereit zum Eintragen in die Play Console, sobald die Kontoeinrichtung abgeschlossen ist:

- Feature-Grafik 1024×500 (Farbverlauf/Wellenmotiv passend zur bestehenden Markenwelt, Icon freigestellt eingebettet, Slogan „Einfach · Sicher · Kristallklar" aus dem bestehenden Splash-Screen übernommen)
- Kurzbeschreibung (74 Zeichen) und Langbeschreibung (~1.580 Zeichen), beta-spezifische Formulierungen entfernt, Positionierungssatz „Mini dokumentiert. Es dosiert nicht. Es berät nicht." als Eröffnung
- 4 Smartphone-Screenshots vom Poolbetreiber bereitgestellt (Messungs-Formular, Messwert-Historie, letzte Einträge, Menü/Export) – empfohlene Reihenfolge: Formular → Historie → Einträge → Menü
- Datenschutz-Link: `https://stefanammon.github.io/poollog/datenschutz.html`

## 9. Play-Console-Kontoeinrichtung – aktueller Blocker

Entwicklerkonto wurde als **privates Konto** unter dem Namen „Stefan Ammon" angelegt. Google verlangt vor jeder App-Veröffentlichung eine mehrteilige Identitätsprüfung:

1. Identität bestätigen (Ausweisdokument hochgeladen) – **in Prüfung bei Google, Stand 20.08.2026**, laut Google „kann einige Tage dauern", Benachrichtigung per E-Mail
2. Zugriff auf ein Android-Mobilgerät bestätigen (via Play-Console-App) – noch offen
3. Kontakttelefonnummer bestätigen – **gesperrt**, bis Schritt 1 abgeschlossen ist

Solange Schritt 1 nicht abgeschlossen ist, ist unklar, ob das Anlegen eines neuen App-Eintrags in der Play Console bereits möglich ist oder ebenfalls blockiert wird – wird beim nächsten Anlauf geprüft.

## 10. Offene Punkte

- Play-Console-Identitätsprüfung abwarten (Google-seitig, siehe Abschnitt 9)
- Danach: App-Eintrag in der Play Console anlegen, Store-Listing mit den in Abschnitt 8 fertigen Assets befüllen
- `.aab` in den internen Testtrack hochladen
- Nach Erstupload: Play-App-Signing-Fingerabdruck ermitteln (*Setup → App-Integrität → App-Signaturschlüssel-Zertifikat*) und `assetlinks.json` um zweiten Eintrag ergänzen
- Installation auf echtem Android-Gerät über den internen Testtrack prüfen: App muss ohne Browser-Toolbar starten (Nachweis erfolgreicher TWA-Verifizierung)
- Kein produktiver Play-Store-Release ohne ausdrückliche Freigabe des Poolbetreibers

## 11. Durchgeführte Prüfungen

| Prüfung | Ergebnis |
|---|---|
| `https://stefanammon.github.io/poollog/` live, Version beta.5 bestätigt | PASS |
| `datenschutz.html` live und inhaltlich korrekt | PASS |
| `icon-512.png` Alphakanal-Prüfung (Python/Pillow) | Transparenz bestätigt, deckende Variante erzeugt |
| `https://stefanammon.github.io/.well-known/assetlinks.json` live, valides JSON mit korrektem Package-Namen und Fingerabdruck | PASS |
| Installation/TWA-Verifizierung auf echtem Android-Gerät | offen |
| Play-Console-Store-Listing vollständig | offen |
