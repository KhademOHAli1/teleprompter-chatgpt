# Teleprompter für ChatGPT und Codex

Eine kleine Teleprompter-App unter MIT-Lizenz. ChatGPT oder Codex kann deinen
Text an die App übergeben. Du kannst ihn auch direkt in die App einfügen.
Die Anzeige bleibt schmal und zentriert.

## Lokal starten

Voraussetzung: Bun 1.4.2 oder neuer.

    bun install --frozen-lockfile
    bun run check
    bun run start

Auf dem Mac geht auch ein Doppelklick auf **start.command**.
Öffne danach **http://127.0.0.1:4317**. Das ist die lokale Vorschau
mit dem offiziellen MCP-Apps-Protokoll, noch keine installierte ChatGPT-App.

Füge deinen Text ein, öffne den Lesemodus und wähle **Sprache folgen**
oder **Auto-Scroll**. Erst ein Klick auf Start aktiviert das Mikrofon.
Wörter lassen sich als Startposition anklicken; Pfeile wechseln den Satz.
Schrift und Spaltenbreite kannst du anpassen.

Pausieren, Text bearbeiten, Modus wechseln oder die App ausblenden beendet
den Mikrofonzugriff. **[Regieanweisungen]** bleiben sichtbar, werden aber
nicht als gesprochene Wörter gezählt.

Die Pegelanzeige zeigt zu leise, passend und zu laut an. „Text erkannt“
beruht auf der Übereinstimmung mit dem Skript und bewertet keine Aussprache.

## In ChatGPT oder Codex öffnen

Der Server stellt **/mcp** bereit. Das Plugin-Paket enthält Manifest,
Server-Verbindung und eine Teleprompter-Skill.

Für lokales Codex läuft der Server unter
**http://127.0.0.1:4317/mcp**. Die mitgelieferte lokale Marketplace-Datei
kann das Plugin verfügbar machen, wenn dieses Verzeichnis als Projekt
geöffnet wird. Je nach Host ist ein Neustart zur Plugin-Erkennung nötig.
Globale Einstellungen werden nicht automatisch geändert.

Für ChatGPT braucht der Server eine erreichbare HTTPS-Adresse oder einen
Entwicklungstunnel. Die genaue Einrichtung steht in [CONNECT.md](docs/CONNECT.md).
Die Oberfläche und der Mikrofonzugriff müssen im konkreten Host geprüft werden.

Beispiel für den Chat:

> Öffne den Teleprompter mit diesem Text: …

## Sprache

Browser-Spracherkennung nutzt den verfügbaren Dienst deines Browsers;
Audio kann dabei an den Browseranbieter übertragen werden.

Optional kannst du auf deinem Server **OPENAI_API_KEY** in einer lokalen
**.env** konfigurieren. Das aktiviert OpenAI-Sprache mit
**gpt-live-transcribe** und minimaler Verzögerung.
Der dauerhafte Schlüssel bleibt auf dem Server. Die App erhält nur
ein kurzlebiges Token und sendet Mikrofon-Audio direkt an OpenAI.
Das nutzt das API-Konto des Betreibers und kann Kosten verursachen.

Die App beginnt Sprache nach dem Startklick zu erfassen und folgt bereits
vorläufigen Transkripten. Echte Geschwindigkeit und Genauigkeit hängen von
Mikrofon, Netzwerk und Erkennung ab. Wenn der Host kein Mikrofon erlaubt,
funktioniert Auto-Scroll weiterhin.

## Open Source

[MIT-Lizenz](LICENSE) · [Englische README](README.md) ·
[Datenschutz und Datenfluss](docs/PRIVACY.md) · [Prüfstand](docs/VALIDATION.md)

    bun run archive

erstellt ein Quellcode-ZIP neben dem Projekt. Private Texte, API-Schlüssel,
Abhängigkeiten und erzeugte Builds werden nicht eingepackt.

## Sprachen

Die Oberfläche folgt der App-Sprache in macOS beziehungsweise der Sprache des
MCP-Hosts oder Browsers. Englisch, Deutsch, Französisch und Spanisch sind
enthalten; für andere Oberflächensprachen wird Englisch verwendet. Die
Skriptsprache lässt sich unabhängig davon auswählen. Der Text wird nicht
übersetzt. Die verfügbaren Erkennungssprachen hängen vom Anbieter ab.
Weitere Informationen: [Lokalisierung](docs/LOCALIZATION.md).
