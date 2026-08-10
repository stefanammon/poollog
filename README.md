# PoolLog

Mobile PWA zur Erfassung strukturierter Pool-Rohdaten.

Die öffentliche App enthält keine historischen Pooldaten. Bestehende Daten werden nach der
Installation lokal über „CSV importieren“ eingelesen und anschließend im Browser des Geräts
(IndexedDB) gespeichert.

## GitHub Pages

Die Dateien dieses Ordners kommen direkt in das Root-Verzeichnis des GitHub-Repositories.
Danach unter Settings → Pages → Deploy from a branch → main / (root) aktivieren.

## Datensicherung

Regelmäßig CSV oder JSON-Backup aus der App exportieren.


## V1.3
- CSV-Export für frei wählbaren inklusiven Datumsbereich
- Anzeige der vergangenen Zeit seit der vorherigen gespeicherten Messung als Eingabehilfe


## V1.5
- Stammdaten-Seite
- Poolbezeichnung und Poolvolumen
- frei definierbarer Beginn von Tag und Nacht
- getrennte Tag-/Nacht-Standards für Dach offen, Badebetrieb, Pumpe und Chlorschwimmer
- Standards unterscheiden bewusst zwischen „nicht erfasst“, 0 Stunden und gesamtem Intervall
- Messdatenstruktur bleibt unverändert


## V1.6
- automatische Intervallklassifikation: Tag / Nacht / Gemischt
- Tag/Nacht basiert auf Stammdaten und Zeitanteilen des Intervalls, nicht nur auf Uhrzeit der aktuellen Messung
- sehr lange Intervalle (ab 20 h) werden bewusst als „Gemischt“ behandelt
- zustandsorientierte Eingabe für Dach, Badebetrieb, Pumpe und Chlorschwimmer
- Stammdaten liefern nur Vorschläge; aus Zuständen entstehen weiterhin ausschließlich die bestehenden *_h-Rohwerte
- JSON-Backup enthält jetzt zusätzlich die Stammdaten und stellt sie wieder her
- CSV bleibt unverändert reiner Rohdatenexport
