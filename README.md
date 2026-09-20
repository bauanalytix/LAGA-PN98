# PN98-Probenahme

Die App ist unter https://bauanalytix.github.io/LAGA-PN98/ erreichbar.

## Auf Android verwenden

1. Die Adresse in Chrome auf dem Handy öffnen oder den QR-Code aus `icons/app-qr.svg` scannen.
2. Chrome-Menü ⋮ → „Zum Startbildschirm hinzufügen“ → „Installieren“ wählen. Bei manchen Chrome-Versionen heißt der Menüpunkt „Installieren und Verknüpfung erstellen“.
3. Die App einmal mit Internet öffnen, bis „Offline bereit“ angezeigt wird. Danach sind Erfassung, gespeicherte Fotos und PDF-Erstellung auch ohne Netz verfügbar.

Für ein Update ist keine Neuinstallation nötig: die App mit Internet neu öffnen und auf „Neue App-Version laden“ tippen, sobald der Button erscheint. Gespeicherte Projekte und Fotos bleiben erhalten. Der bisherige QR-Code bleibt gültig.

## Projekte bearbeiten

- Mit „Neues Projekt“ ein Protokoll beginnen. Für jedes Haufwerk eine eigene Projektnummer verwenden, beispielsweise `2026001-3a`.
- Mit „Daten übernehmen“ ein gespeichertes Projekt als Vorlage wählen und eine neue Projektnummer vergeben. Grunddaten, Haufwerksangaben, Probenumfang und Proben-IDs werden übernommen. So muss bei ähnlichen Proben-IDs nur die laufende Nummer angepasst werden. Fotos und die übrigen Mischprobendetails bleiben leer. Die Vorlage bleibt unverändert. Eine vorhandene Projektnummer kann dabei nicht überschrieben werden.
- Eingaben, Mischproben und Fotos werden automatisch gespeichert. Der Speicherstatus bestätigt erst nach erfolgreichem Schreiben, dass die Daten auf diesem Gerät liegen. „Jetzt speichern“ steht zusätzlich zur Verfügung.
- Unter „Gespeicherte Protokolle“ ein Projekt auswählen und „Öffnen“ drücken. Ein unvollständiges Protokoll kann jederzeit fortgesetzt werden. Auch Eingaben ohne Projektnummer werden als „Ohne Projektnummer“ gesichert.
- „Mischproben anlegen / Anzahl anpassen“ erhält vorhandene Einträge. Beim Verkleinern wird vor dem Entfernen der betroffenen Proben und Fotos nachgefragt.
- „PDF für dieses Projekt erstellen“ erzeugt das PDF des gerade geöffneten Projekts. Die gespeicherten Daten bleiben danach bearbeitbar.
- „Projekt löschen“ entfernt nach Rückfrage das geöffnete Protokoll mit seinen Fotos vom Gerät. Bereits heruntergeladene Dateien bleiben erhalten.

Die gleiche Projektnummer darf nur einmal existieren; Groß-/Kleinschreibung und äußere Leerzeichen werden beim Vergleich ignoriert. Ändern zwei Tabs dasselbe Projekt, verhindert eine Versionsprüfung stilles Überschreiben. Der zweite Stand kann als separat benannte Kopie gespeichert werden.

## Sicherung und Gerätewechsel

Die Daten werden ausschließlich im Browser des jeweiligen Geräts gespeichert. Es gibt keine automatische Synchronisierung und keinen Server für Protokolldaten. Die Installation aus Chrome auf demselben Handy verwendet denselben Speicher.

Unter „Sicherung und Gerätewechsel“ ganz unten eine JSON-Sicherung mit allen Projekten einschließlich Fotos herunterladen. Diese Datei kann auf einem anderen Gerät über „Sicherung einlesen“ übernommen werden. Bereits vorhandene Projektnummern werden übersprungen, nicht ersetzt. Eine Sicherung kann nach versehentlichem Löschen erneut eingelesen werden. Nicht gespeicherte Konfliktstände werden im Export zusätzlich als eindeutig benannte Kopie gesichert.

Kein privates Browserfenster verwenden. Das Löschen von Website-/Browserdaten kann auch die Protokolle entfernen. Sicherungen separat aufbewahren, insbesondere vor einem Gerätewechsel. Der QR-Code öffnet nur die App und überträgt keine Projektdaten.

## Betrieb und Wartung

Statische Dateien ohne Build-Schritt. GitHub Pages veröffentlicht den Repository-Inhalt. Es werden keine externen Skripte zur Laufzeit geladen. Die bereits zuvor verwendete jsPDF-Version 2.5.1 liegt einschließlich Lizenzkopf unter `vendor/`, damit PDFs offline erzeugt werden können.

- `storage.js`: IndexedDB, eindeutige Projektnummer, atomare Schreib- und Löschtransaktionen mit Versionsprüfung.
- `app.js`: mobile Bedienung, automatisches Speichern, Sicherung/Import und komprimierte Fotos.
- `pdf.js`: bestehende drei Protokollabschnitte, mehrzeilige Angaben und Fotos mit Seitenumbruch, projektspezifischer Dateiname.
- `sw.js`: ausschließlich App-Dateien im versionierten Offline-Cache; Protokolldaten bleiben in IndexedDB. Bei jeder Veröffentlichung mit geänderten App-Dateien die Cache-Version ändern. Eine wartende Version wird erst über „Neue App-Version laden“ aktiviert; zuvor wird gespeichert.
- `manifest.webmanifest`: Installation unter dem vorhandenen GitHub-Pages-Unterpfad.

Lokale Entwicklung über einen HTTP-Server auf localhost, nicht durch Doppelklick auf die HTML-Datei. Browserprüfung: `node tests/e2e.cjs` mit Playwright und Chromium. Für die hier eingesetzte Umgebung wird Playwright über `NODE_PATH` aus dem gebündelten Runtime-Paket aufgelöst.

Installation und Speicherkonzept: [Chrome-Hilfe für Android](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=de), [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB), [installierbare Web-Apps](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).
