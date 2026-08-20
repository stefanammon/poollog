# PoolLog4U Mini – Strategie: PWA vs. native App & Anfangsphase Marketing

**Stand:** 19.08.2026
**Ausgangslage:** FreePoolLog4U Mini 1.0.0-beta.5, Vanilla-JS-PWA + Supabase, technisch abgeschlossen getestet und deployed, aktuell geschlossener Betatest (max. 20 Tester, hartes Supabase-Auth-Limit bei 30 Accounts). Rahmen für diese Einschätzung: Solo-Entwicklung nebenberuflich, Zeit eher phasenweise verfügbar (größere Slots z. B. an Wochenenden/im Urlaub statt feste Wochenstunden), Marketingbudget variabel je nach nachgewiesenem ROI, Ziel: Mini als Wachstumsbasis für das spätere kostenpflichtige Pro-Upselling aufbauen.

Grundlage der fachlichen Einordnung ist das bestehende Konzeptdokument `docs/POOLLOG4U_PRO_KONZEPT.md`: Mini dokumentiert nur, gibt bewusst keine Dosierungs- oder Beratungsfunktion; Pro soll später intelligent auswerten und beraten. Das ist für beide Themen unten relevant – es ist zugleich die Kernbotschaft der Positionierung und der Grund, warum eine spätere Monetarisierungsarchitektur (Store vs. eigenes Abo) so früh mitgedacht werden sollte.

---

## 1. PWA vs. „richtige" App

### 1.1 Kurzfazit

Für die aktuelle Phase (Mini kostenlos, Pro noch nicht gebaut, kein belegter Nutzerdruck) lohnt sich ein voller iOS-Wrapper noch nicht. Die PWA deckt die fachlichen Kernanforderungen ab; die größten PWA-Nachteile treffen konkret nur iOS, und selbst dort sind sie eher Reibungsverluste als harte Blocker. Anders sieht es bei Android aus: Eine sehr günstige Android-Store-Präsenz (Trusted Web Activity) lohnt sich schon früh, unabhängig von belegter Traktion, weil sie fast nichts kostet und echten Play-Store-Vertrieb für die kostenlose Version liefert. Ein voller Capacitor-Wrapper für iOS bleibt dagegen zurückgestellt, bis entweder technische Reibung oder – neu ergänzt in 2.6 – ein über die App selbst gemessenes Pro-Interesse den Aufwand rechtfertigt.

### 1.2 iOS-spezifische PWA-Einschränkungen im Detail

- **Installierbarkeit:** iOS Safari zeigt keinen automatischen „App installieren"-Banner (kein `beforeinstallprompt`). Nutzer müssen manuell über das Teilen-Symbol „Zum Home-Bildschirm" wählen – ein Schritt, den viele nicht kennen. Das ist der größte reale Reibungspunkt, nicht Push oder Offline.
- **Push-Benachrichtigungen:** Seit iOS 16.4 funktioniert Web Push grundsätzlich, aber nur für zum Home-Bildschirm hinzugefügte (installierte) PWAs, nicht für Safari-Tabs. Die Opt-in-Rate dürfte niedriger liegen als bei nativen Apps, weil der Installationsschritt vorher schon eine Hürde ist.
- **Offline/Speicher-Persistenz:** Service Worker und Cache API funktionieren auf iOS grundsätzlich. Safaris Speicherbereinigung (ITP) betrifft primär reine Browser-Tabs bei längerer Inaktivität; zum Home-Bildschirm hinzugefügte PWAs sind davon weitgehend ausgenommen. Das heißt: Solange Nutzer den Install-Schritt tatsächlich machen, ist Offline-Verlässlichkeit kein großes Thema mehr.
- Kurz: Nahezu alle iOS-Nachteile hängen an einem einzigen Nutzerschritt („Zum Home-Bildschirm hinzufügen"), nicht an grundsätzlicher technischer Limitierung. Das lässt sich mit guter Onboarding-Anleitung auf der Landingpage/im Beta-Manual entschärfen, bevor man einen Wrapper baut.

### 1.3 Android ist anders gelagert

Auf Android/Chrome gibt es einen echten Install-Banner, Push funktioniert zuverlässig, Offline-Speicher wird nicht in gleicher Weise beschnitten. Zusätzlich existiert mit **Trusted Web Activity (TWA)** ein sehr günstiger Weg, dieselbe PWA als eigenständigen Play-Store-Eintrag zu veröffentlichen – im Kern ein dünner Wrapper um die bestehende PWA, ohne Codeumbau, Aufwand eher im Bereich eines Tages als Wochen, einmalige Google-Play-Gebühr (aktuell ca. 25 USD einmalig, zur Sicherheit bei Play-Console-Anmeldung prüfen). Das ist damit der mit Abstand günstigste Testballon für „Sichtbarkeit im Store", falls App-Store-Auffindbarkeit sich als relevanter Faktor erweist.

**Wichtig: TWA ist eine Android/Chrome-spezifische Technik (Custom Tabs + Digital Asset Links) und hat keine iOS-Entsprechung.** Apple bietet keinen vergleichbaren „Website als Store-Eintrag verpacken"-Mechanismus. Für einen App-Store-Eintrag auf iOS führt kein Weg an einer echten nativen Hülle (z. B. Capacitor) vorbei – siehe 1.4.

### 1.4 Aufwand/Kosten eines Wrappers (Capacitor) vs. Vollnativ

- **Capacitor** ist für eine bestehende Vanilla-JS-PWA der pragmatische Weg: Die Web-App wird in eine native Hülle gepackt, bekommt Zugriff auf zuverlässigere native APIs (Push, evtl. Biometrie) und ein echtes Store-Listing, bei weitgehend erhaltenem Single-Codebase-Ansatz. Realistischer Aufwand für eine bereits fertige App: grob 1–3 Wochen nebenberuflicher Arbeit für Grundintegration, Icons/Screenshots, Store-Metadaten, TestFlight/Play-Internal-Testing – plus unvorhersehbare Wartezeit durch Review-Zyklen (bei Apple oft mehrere Tage, gelegentlich länger bei Rückfragen).
- **Apples „Minimum Functionality"-Regel (Review-Richtlinie 4.2) beachten:** Apple lehnt Apps ab, die im Kern nur eine Website in einer WebView sind, ohne erkennbaren nativen Mehrwert. Ein reiner 1:1-Wrapper der PWA reicht daher unter Umständen nicht für die Freigabe; es braucht etwas „Natives" obendrauf (z. B. native Push-Anbindung, Share-Sheet-Integration). Das schiebt den realistischen Aufwand eher an die obere Grenze der 1–3 Wochen und macht den Review-Ausgang weniger planbar als bei Android.
- **Tauri** ist für Mobile deutlich weniger ausgereift als für Desktop und für ein Solo-Projekt aktuell kein empfehlenswerter Weg auf iOS/Android – falls Tauri überhaupt in Betracht gezogen wird, eher für eine mögliche spätere Desktop-Variante, nicht für die App-Store-Frage.
- **Vollnativ (Swift/Kotlin getrennt)** steht in keinem Verhältnis zum Aufwand für eine im Kern datenerfassende CRUD-App und wäre für diese Konstellation überdimensioniert.
- Wichtig für die Kalkulation: Ein Wrapper **ersetzt die PWA nicht**, sondern kommt zusätzlich obendrauf. Web/PWA-Pflege (Service Worker, Manifest, Deployment) bleibt bestehen, weil Desktop- und viele Android-Nutzer weiter darüber laufen dürften. Es entsteht also eine dritte Pflegeoberfläche (native Builds, Store-Compliance, OS-Versionssprünge), nicht ein Tausch.

### 1.5 Monetarisierung: Store-Anteil vs. eigenes Abo

Das ist der Punkt mit dem größten Hebel auf die spätere Pro-Version. Digitale Abos, die **innerhalb** einer App-Store-App verkauft werden, unterliegen in der Regel den In-App-Purchase-Regeln der Stores mit einer Provision (historisch 15–30 % je nach Store/Umsatzstufe). Die genauen Regeln sind in Bewegung – u. a. durch die Auseinandersetzung Epic vs. Apple in den USA und den Digital Markets Act in der EU, die beide in den letzten Jahren mehr Spielraum für externe Zahlungslinks geschaffen haben. Das solltest du zum Zeitpunkt der tatsächlichen Pro-Einführung nochmal aktuell prüfen (Apple- und Google-Entwicklerdokumentation), bevor du dich festlegst – der Trend geht zwar Richtung mehr Flexibilität, aber Detailregeln und Ausnahmen ändern sich weiterhin.

Für die Strategie heute reicht die grobe Richtung: Ein **reines Web/PWA-Abo über einen eigenen Zahlungsanbieter (z. B. Stripe)** umgeht die Store-Provision komplett, bleibt eine einzige Codebasis/ein Backend (Supabase) und ist für einen Solo-Entwickler deutlich einfacher zu bauen und zu warten als parallele IAP-Anbindungen pro Store. Das spricht klar dafür, Pro zunächst **nicht** über native Stores zu monetarisieren, sondern die PWA/Web-Linie als primären Verkaufskanal zu behalten – Store-Präsenz (falls überhaupt) dann eher als zusätzlicher Auffindbarkeits-/Vertrauenskanal mit Verlinkung zur eigentlichen Web-Anmeldung, nicht als IAP-Verkaufsfläche.

### 1.6 Auswirkung auf die Pro-Version

Da Pro auf denselben historischen Mini-Daten aufbaut (Wasserlinien-Referenz, Wasserfüllungs-Ereignisse etc.), ist die Backend-Architektur (Supabase) unabhängig von der Frage PWA/nativ. Die Wrapper-Entscheidung betrifft nur die Vertriebs-/Zugriffsschicht, nicht das Datenmodell. Das heißt: Diese Entscheidung kann bewusst **nach hinten verschoben** werden, ohne dass dadurch spätere Optionen verbaut werden – ein Grund mehr, sie nicht vorzeitig zu treffen.

### 1.7 Trigger-Kriterien statt Bauchgefühl

Ein Wrapper/Store-Listing lohnt sich, wenn konkrete Daten das nahelegen, nicht wenn es sich „professioneller" anfühlt:

- Messbar hohe Absprungrate von iOS-Nutzern genau am Installationsschritt (dafür braucht es zunächst ein einfaches Tracking, siehe Abschnitt 2.3).
- Pro existiert bereits, hat zahlende Nutzer, und Push-gesteuerte Erinnerungsfunktionen („in 4 Stunden nachmessen") erweisen sich als zentral für Retention, aber die iOS-Web-Push-Opt-in-Rate ist nachweislich zu niedrig.
- Nutzer fragen aktiv nach einer „echten App" / suchen im Store danach (beobachtbar z. B. über Support-Anfragen oder Beta-Feedback).
- **Ein über die in 2.6 beschriebene In-App-Abfrage belegtes Pro-Interesse liegt über einer für dich sinnvollen Schwelle** – d. h. es gibt eine reale Zahl potenzieller Pro-Abonnenten, nicht nur eine Vermutung, die die Wochen Aufwand (und das Review-Risiko aus 1.4) rechtfertigt.

Bis eines davon eintritt, ist der volle Aufwand für einen iOS-Wrapper gegenüber der PWA nicht gerechtfertigt. Für Android liegt der Fall anders: TWA kostet fast nichts, hat kein Apple-Review-Risiko und liefert zusätzlich echten Play-Store-Vertrieb für die kostenlose Version – dafür würde ich das Auslöse-Kriterium nicht abwarten, sondern es relativ früh umsetzen (siehe auch 2.5).

---

## 2. Anfangsphase Marketing

### 2.1 Positionierung / Zielgruppenschärfung

Die fachliche Grundhaltung aus dem Pro-Konzept ist zugleich die stärkste Positionierung: **„Mini dokumentiert ehrlich – ohne Scheingenauigkeit, ohne Pseudo-Beratung."** Viele bestehende Pool-Apps geben pauschale Dosierempfehlungen, die fachlich angreifbar sind; Mini verzichtet bewusst darauf und liefert stattdessen sauber geführte, dauerhaft konsistente historische Daten. Das ist ein glaubwürdiger Kontrast, den man in der Kommunikation offen ausspielen kann, statt ihn als Einschränkung zu verstecken.

Zielgruppe realistisch eingegrenzt: **Privatpool-Besitzer, die ihre Werte selbst pflegen** (Garten-/Einbaupools, keine gewerblichen Betreiber) und die entweder aktuell Zettel/Excel nutzen oder gar nicht strukturiert dokumentieren. Tech-Affinität muss nicht hoch sein, aber ein gewisses Interesse an Genauigkeit/Nachvollziehbarkeit sollte vorhanden sein – das deckt sich gut mit der ehrlichen, unaufgeregten Positionierung. Eine engere Sekundärgruppe: Poolbesitzer mit mehreren Pools oder wechselnden Verantwortlichen (Familie, Nachbarschaftshilfe), für die konsistente Historie besonders wertvoll ist.

### 2.2 Kanäle mit kleinem Budget/Soloaufwand, priorisiert

1. **Bestehende 20 Betatester als Multiplikatoren.** Der günstigste und vertrauenswürdigste erste Kanal. Gezielt fragen, ob sie 1–2 Personen aus ihrem Umfeld empfehlen würden, und – wichtiger noch – ihre eigenen Formulierungen einsammeln, wie sie die App Dritten beschreiben würden. Das liefert nebenbei Werbetext, der tatsächlich nach Nutzersprache klingt statt nach Marketing.
2. **Lokale Ansprache über Poolbauer/-händler.** Wenn ein oder zwei lokale Schwimmbadbauer oder Poolzubehör-Händler bereit sind, einen QR-Code/Flyer an Neukunden weiterzugeben, ist das ein sehr günstiger, hochvertrauenswürdiger Kanal – ggf. lässt sich das über die eigenen Betatester anbahnen, falls einer seinen Pool von einem lokalen Anbieter hat.
3. **Deutschsprachige Pool-Foren und Facebook-Gruppen** (z. B. Pool-Selbstbau-/Poolpflege-Communities). Wichtig: nicht plump bewerben, sondern in echten Threads zu Messwert-Dokumentation/Poolpflege helfen und die App dort erwähnen, wo sie tatsächlich das Problem im Thread löst. Vorher Forumsregeln zu Eigenwerbung prüfen.
4. **Eigene Landingpage mit ein paar SEO-Textseiten** zu Themen wie „Pool-Messwerte dokumentieren", „Warum eine Excel-Tabelle für die Poolpflege an ihre Grenzen kommt". Long-Tail-Suchanfragen, wenig Konkurrenz, passt zur ehrlichen Positionierung (keine Dosierversprechen, die Google-Konkurrenz oft macht).
5. **YouTube-Outreach zu bestehenden Poolpflege-Kanälen.** Kein Geld nötig, nur eine gute, kurze Pitch-Mail mit klarem Nutzen für deren Zuschauer. Trefferquote gering, aber bei Nischenpublikum potenziell hoher Hebel pro Erfolg.
6. **Bezahlte Tests erst später, sehr klein dosiert.** Da Budget „variabel je nach ROI" ist: Erst wenn Landingpage + Tracking stehen (Abschnitt 2.3) und organische Kanäle erste Signale liefern, lohnt sich ein kleiner geo-/interessenbasierter Anzeigentest (z. B. Meta, Zielgruppe „Pool"/Hauseigentümer) mit einem sehr kleinen Tagesbudget, um Kosten pro Signup überhaupt einschätzen zu können. Vorher ist jedes Ad-Budget im Blindflug.

### 2.3 Was vor einem öffentlichen Launch noch fehlt

- **Landingpage** (fehlt aktuell): klare Kernaussage in der ersten Zeile, 2–3 Screenshots/kurzes GIF, explizite „kostenlos, keine Werbung"-Botschaft, plattformabhängige Installationsanleitung (gerade für iOS „Zum Home-Bildschirm hinzufügen" explizit erklären, siehe 1.2), Verlinkung zu Impressum/Datenschutz (vorhanden), kurze FAQ, die auch offen erklärt, warum Mini bewusst keine Dosierberatung gibt – das aus Nachteil zu Vertrauensargument macht. **Praktischer Hinweis:** Das bestehende `FreePoolLog4U_Mini_1.0.0beta.5_Testerhandbuch.docx` enthält bereits gut geschriebene Erklärtexte (u. a. „Was Mini macht", die Drei-Ebenen-Logik Messung/Aktion/Produkt, „Mini dokumentiert. Es dosiert nicht. Es berät nicht."), die sich mit wenig Aufwand für Landingpage-Texte und FAQ wiederverwenden lassen – nur die beta-spezifische Rahmung (QR-Code, „Kurzanleitung zum Betatest") muss raus.
- **Minimale, datenschutzfreundliche Analyse-/Tracking-Basis** (z. B. Plausible, Fathom oder selbstgehostetes Umami statt Google Analytics), bevor überhaupt Marketingaufwand investiert wird. Ohne das lässt sich „Budget variabel je nach ROI" gar nicht seriös umsetzen, weil schlicht keine Vergleichsbasis existiert, welcher Kanal etwas bringt.
- **Store-Listing:** auf Basis von Abschnitt 1 aktuell nicht nötig; höchstens die günstige Android-TWA-Option als Testballon, aber kein Muss für den Start.
- **Technische Entscheidung zur Beta-Kappung:** Das aktuelle Supabase-Hard-Limit (30 Accounts) ist explizit als temporäre Sicherung für den geschlossenen Test dokumentiert. Vor einem breiteren Launch muss diese Grenze entweder deutlich angehoben oder – besser für den ersten Eindruck – durch eine freundliche Warteliste statt einer harten technischen Fehlermeldung ersetzt werden, falls die Supabase-Free-Tier-Kapazität (Datenbankgröße, Bandbreite, Auth-Rate) noch nicht für unbegrenztes Wachstum ausgelegt ist. Das sollte vor dem Launch-Datum bewusst entschieden und nicht dem Zufall überlassen werden.
- **Support-Kanal für breiteres Publikum:** Bei 20 Testern lief Feedback vermutlich direkt und persönlich; bei einer offenen Zielgruppe braucht es einen einfachen, klar sichtbaren Kontaktweg (E-Mail-Adresse oder Formular reicht), ohne dass das viel zusätzlichen Aufwand bedeutet.

### 2.4 Feedback aus der aktuellen Beta strategisch nutzen

Die Beta hat ihren technischen Zweck bereits erfüllt (siehe abgeschlossene Tech-Optimierungen). Für den Marketing-Übergang lohnt sich zusätzlich ein kurzer, strukturierter Abschluss-Fragebogen oder ein kurzes Gespräch mit den 20 Testern, gezielt zu:

- Was hat überzeugt, weiter dranzubleiben – in eigenen Worten? (liefert Testimonial-Rohmaterial, mit Einverständnis für die Landingpage nutzbar)
- Was war der größte Frustrationspunkt, bevor die Nachbesserungen kamen? (zeigt, wie robust die App jetzt wirklich für Fremde ist)
- Wonach hätten sie gesucht/würden sie suchen, wenn sie die App nicht schon kennen würden? (liefert reale Suchbegriffe für die SEO-Textseiten aus 2.2)
- Würden sie für eine „intelligente" Pro-Version zahlen, und wofür konkret? (erste, wenn auch kleine, Validierung der Pro-Monetarisierung, bevor viel Aufwand in Pro fließt)

Wer besonders aktiv genutzt hat, ist ein guter Kandidat für gezielte Weiterempfehlung oder ein ausführlicheres O-Ton-Zitat.

### 2.6 Pro-Interesse früh über den bestehenden Feedback-Mechanismus wecken

Guter, unabhängig von der PWA/native-Frage sofort umsetzbarer Punkt: Der in Mini bereits integrierte Feedback-Weg lässt sich leicht um eine kurze, freiwillige Pro-Interesse-Abfrage erweitern – z. B. eine Mehrfachauswahl „Welche dieser zukünftigen Pro-Funktionen wären für dich interessant?" (Dosierungsempfehlung, automatische Volumenberechnung, Referenzwechsel bei Beckenumbauten usw., orientiert an den Themen aus `POOLLOG4U_PRO_KONZEPT.md`) plus ein optionales E-Mail-Opt-in „Informier mich, wenn Pro startet".

Das hat drei Vorteile gleichzeitig: Es beginnt schon heute, während Mini noch in der geschlossenen Beta bzw. am Übergang zum offenen Launch ist, eine Vor-Launch-Interessentenliste für Pro aufzubauen; es liefert dir eine echte Priorisierung, welche Pro-Funktionen zuerst gebaut werden sollten, statt das allein aus dem Konzeptdokument abzuleiten; und es liefert die konkrete Kennzahl, die in 1.7 als zusätzliches Auslöse-Kriterium für die iOS-Wrapper-Investition dient. Der Aufwand dafür ist klein (eine zusätzliche Frage plus ein E-Mail-Feld) und passt gut in einen der kleinen Zeit-Slots aus 2.5, noch vor dem größeren Landingpage-Block.

**Konkret zur aktuellen Umsetzung:** Laut Testerhandbuch ist die bestehende Beta-Feedback-Funktion ein Menüpunkt, der eine vorbereitete E-Mail an `freepoollog4u@gmail.com` öffnet (mit automatisch ergänzter Version-/Geräteinfo) – keine strukturierte In-App-Erfassung. Der günstigste erste Schritt ist deshalb, den vorausgefüllten E-Mail-Text um die Pro-Interesse-Fragen zu ergänzen (Tester füllt sie beim Antworten einfach aus); das liefert vorerst Freitext-E-Mails statt sauber auswertbarer Daten, reicht für ein erstes Signal aber aus. Ein echtes Formular mit Datenbankeintrag für auswertbare Zahlen wäre ein separater, größerer Schritt für später. Zusätzlich lohnt sich der Hinweis, dass aktive Betatester (≥ 4 Wochen Nutzung + Feedback) laut Handbuch bereits ein Jahr PoolLog4U Pro kostenlos erhalten – dieselbe Gruppe ist damit auch die naheliegendste Quelle für die O-Ton-Zitate aus 2.4.

### 2.5 Realistischer Fahrplan (an phasenweise verfügbare Zeit UND an die Poolsaison angepasst)

Ergänzung vom 19.08.2026: Ein öffentlicher Marketing-Push im Spätsommer/Herbst ist saisonal ungünstig – die Zielgruppe (aktive Poolnutzung/-pflege) ist dann klein, und jede ROI-Messung von bezahlten Kanälen wäre in der Nebensaison verzerrt und wenig aussagekräftig. Deshalb werden die Vorhaben unten bewusst nach Saisonabhängigkeit entkoppelt, statt sie alle „bei nächster Gelegenheit" abzuarbeiten. Feste Wochenstunden sind ohnehin nicht realistisch, daher eher in Arbeitsblöcken als in Kalenderwochen denken:

- **Jetzt / kleine Slots (Spätsommer, Saisonende):** Beta-Abschlussfeedback strukturiert einsammeln – bewusst jetzt, weil die Tester gerade eine volle Saison Nutzungserfahrung hinter sich haben; In-App-Pro-Interesse-Abfrage aus 2.6 ergänzen; Analytics-Grundlage einrichten; Entscheidung zur Supabase-Kappung treffen. Diese Schritte sind saisonunabhängig und sollten nicht auf das Frühjahr verschoben werden.
- **Herbst/Winter, größere Blöcke:** PoolLog4U Pro entwickeln – die ruhige Phase ohne parallelen Live-Support für ein breites Publikum eignet sich dafür am besten. Parallel dazu, ebenfalls ohne Reichweitendruck: Landingpage inklusive Installationsanleitung und FAQ bauen (siehe Wiederverwendung des Testerhandbuchs oben), erste SEO-Textseite(n) auf Basis der realen Suchbegriffe aus dem Beta-Feedback schreiben und veröffentlichen. Der Sinn dieser Reihenfolge: Content, der im Winter veröffentlicht wird, hat bis zum Saisonstart Zeit zu ranken. Android-TWA-Listing kann in dieser Phase ebenfalls schon umgesetzt werden – geringer Aufwand, unabhängig von Saison oder belegter Traktion.
- **Januar/Februar:** guter Zeitpunkt für lokale Ansprache bei Poolbauern/-händlern (Kanal aus 2.2) – die haben vor ihrer eigenen Hochsaison eher Kapazität für eine Kooperationsanfrage als mitten im Sommer.
- **März/April (Poolprofis „wecken" die Pools) bis Mai (regulärer Saisonstart):** der eigentliche breite Launch-Push – Foren/Communities aktiv bespielen, YouTube-Outreach verschicken, erster kleiner bezahlter Ad-Test, sobald Landingpage und Tracking stehen. Der über den Winter aufgebaute SEO-Vorlauf sollte zu diesem Zeitpunkt bereits greifen.
- **Nur bei belegter Traktion bzw. belegtem Pro-Interesse:** iOS-Wrapper erst angehen, wenn Pro existiert, zahlende Nutzer hat und die Trigger-Kriterien aus 1.7 (inkl. der Pro-Interesse-Zahl aus 2.6) tatsächlich eintreten – der längere Vorlauf bis zum Saisonstart verschafft mehr Zeit, dieses Signal überhaupt sauber zu sammeln.

---

## 3. Offene Entscheidungen, die nur du treffen kannst

- **Grobes Pro-Preismodell**, auch nur als Richtung (Abo vs. Einmalkauf, ungefähre Preisspanne) – beeinflusst schon jetzt, ob eine spätere Store-Anbindung überhaupt sinnvoll wäre, auch wenn Pro fachlich noch nicht gebaut wird.
- **Umgang mit der Beta-Kappung:** hartes Limit deutlich anheben oder durch Warteliste ersetzen – abhängig davon, wie sicher du dir bei der Supabase-Free-Tier-Kapazität für eine größere Nutzerzahl bist.
- **Wie viel „variables Budget" du dir für einen ersten kleinen Ad-Test tatsächlich vorstellen kannst**, sobald Landingpage und Tracking stehen – das entscheidet, ob Kanal 6 aus Abschnitt 2.2 in den ersten Monaten überhaupt relevant wird.
