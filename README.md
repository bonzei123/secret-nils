# Secret Nils

Satirisches Online-Partyspiel für 5–10 Personen. Ein fiktiver Cannabis Social Club stimmt über seine Zukunft ab. Die ehrlichen Mitglieder wollen den Verein transparent führen, ein kleiner Klüngel will die Kasse. **Kein Bezug zu echten Vereinen, Personen oder Organisationen.** Die Mechanik ist eine eigenständige Umsetzung eines bekannten Social-Deduction-Brettspiels, ohne dessen Texte oder Gestaltung zu übernehmen.

## Architektur

```
shared/   Typen, Kartentexte, deterministische State-Machine, gefilterte Spielersicht
server/   Vereinsheim (Lobby), WebSockets, Zug-Timer, Reconnect
client/   React-Oberfläche: Warteraum, Vereinsbrett, Ausweis, Sitzungsprotokoll
```

Der Server ist die einzige Autorität. Rollen, der Kartenstapel, verdeckte Stimmkarten und Kassenprüfungsergebnisse liegen im Speicher der Sitzung und werden pro Verbindung gefiltert:

- Ehrliche Mitglieder sehen nur die eigene Rolle.
- Linientreue Festangestellte sehen einander und Nils.
- Nils sieht die Festangestellten nur bei 5–6 Spielern, ab 7 nicht.
- Gezogene Vorlagen sehen nur Vorsitz und Kasse, und auch nur die Karten, die ihnen gerade vorliegen.
- Stimmen werden erst nach dem letzten Zettel veröffentlicht.

Ein JSON-Snapshot einer `GameState` wäre serialisierbar (kein Socket, keine Funktion). Für eine Party reicht ein Node-Prozess. Mehrere Instanzen bräuchten einen gemeinsamen Store wie Redis; der ist hier bewusst nicht eingebaut, damit das Spiel ohne Zusatzdienst startet.

### Stack

| Teil | Wahl | Warum |
| --- | --- | --- |
| Sprache | TypeScript | Eine State-Machine für Engine, Server und UI |
| Echtzeit | Socket.io auf Node | Räume, Reconnect, Fallbacks; der Client spricht nur Aktionen |
| UI | React + Vite | Schnelles, responsive Vereinsbrett ohne Framework-Ballast |
| Tests | Vitest | Phasen, Siegbedingungen, Informationslecks, Lobby, Socket |

**Nicht Next.js:** die Sitzung ist ein langlebiger Prozess mit Timer und geheimem Zustand. Den neben den React-Server zu stellen hält die Autorität an einer Stelle. Eine Alternative wäre ein gehosteter Realtime-Dienst (PartyKit, Ably) plus dieselbe Engine; fürs Vereinsheim am Küchentisch ist ein Prozess genug.

### Regeln, die man sonst falsch erinnert

- Der Notverwaltungs-Tracker zählt Regierungen **ohne Beschluss**: abgelehnte Wahlen und anerkannte Formfehler-Rügen. Er fällt auf null, sobald irgendein Beschluss in Kraft tritt — auch per Notverwaltung.
- Eine Notverwaltung löst keine Sonderaktion aus und hebt die Amtsperre auf.
- Gleichstand ist eine Ablehnung. Ab fünf verbliebenen Mitgliedern ist auch der letzte 1. Vorsitz gesperrt, sonst nur der letzte Kassenwart.
- Eine Sondersitzung gilt für genau eine Wahl. Danach geht der Vorsitz an die nächste lebende Person nach dem, der sie einberufen hat.
- Nils als Kassenwart gewinnt erst, wenn schon mindestens drei Eigeninteresse-Beschlüsse gelten. Wird Nils nicht entlastet, gewinnen sofort die ehrlichen Mitglieder.
- Kassenprüfung zeigt nur das Lager. Nils erscheint als Klüngel, nicht namentlich.

Sonderaktionen auf dem Eigeninteresse-Track:

| Feld | 5–6 | 7–8 | 9–10 |
| --- | --- | --- | --- |
| 1 | — | — | Kassenprüfung |
| 2 | — | Kassenprüfung | Kassenprüfung |
| 3 | Tagesordnung | Sondersitzung | Sondersitzung |
| 4–5 | Nicht-Entlastung | Nicht-Entlastung | Nicht-Entlastung |
| 6 | Sieg des Klüngels | Sieg des Klüngels | Sieg des Klüngels |

Ab dem fünften Eigeninteresse-Beschluss können Kasse und Vorsitz gemeinsam Formfehler rügen.

## Start

```bash
npm install
npm test
npm run dev
```

Vite auf [http://localhost:5173](http://localhost:5173), Spielserver auf Port 3001. Das Vite-Dev-Server-Proxy leitet `/socket.io` dorthin, deshalb reicht im Browser eine Adresse. Im Handy-Netz `npm run dev` und die LAN-IP von Port 5173 öffnen.

Produktion, ein Prozess:

```bash
npm run build
npm start
```

Dann liefert der Server die gebaute Oberfläche und die Sockets auf `PORT` (Standard 3001).

Zum Alleintesten im Vereinsheim „Probespiel mit Platzhaltern“ ankreuzen. Unter fünf Personen setzt der Server Platzhalter dazu, bis der Tisch fünf Sitze hat. Sie spielen nach ihrer Rolle mit und sind markiert. Ab fünf echten Mitgliedern bleibt der Tisch, wie er ist.

Der QR-Code im Warteraum ist der Beitrittslink. `PUBLIC_ORIGIN` in der Compose-Datei setzt die öffentliche Adresse, hier `https://secret-nils.bonzei.eu`. „Zuschauer ohne Sitz“ lässt andere die laufende Sitzung von der Tribüne sehen, ohne Rolle und ohne Stimme. Am Ende gibt es eine Übersicht mit Dauer, wer noch drin ist, wer raus ist und welche Anträge durchgingen. Den Link dazu kann man kopieren, teilen oder als PNG speichern. Unten verlinkt das Registergericht alle beendeten Sitzungen. Jede liegt als Bild in `registergericht/` neben dem Projekt. Im Dateinamen stehen Datum, Raum und Ausgang. Die Datei löschen entfernt den Eintrag.

Auf der Startseite lassen sich unter „Beschlussvorlagen schreiben“ die mitgelieferten Anträge umformulieren und eigene dazuschreiben. Dieselbe Seite liegt direkt unter `http://<nas>:1488/#satzung`. Gespeichert wird das in `data/policies.json` (im Container unter `/app/data`, das Compose-Volume `secret-nils-data` behält den Ordner über Neubauten). Eine schon laufende Sitzung behält ihren Stapel. Die nächste mischt die neue Fassung.

Ohne weiteres kann jeder, der die Seite erreicht, diese Vorlagen ändern. Das Sperrwort steht nicht in `docker-compose.yml`, sondern in `.env` neben der Compose-Datei. Die Vorlage ist `.env.example`. Git ignoriert `.env`, deshalb übersteht das Wort jeden `git pull`.

```bash
cp .env.example .env
```

In `.env` dann die Zeile `SATZUNG_PASSWORT=...` setzen und den Container neu starten. Speichern fragt danach. Mitspielen bleibt ohne dieses Wort möglich. Port 1488 nur im eigenen Netz lassen, nicht ins Internet weiterleiten.

## Docker

Dasselbe Produktionsbild, ein Container, Port 1488:

```bash
docker compose up --build
```

Im Browser [http://localhost:1488](http://localhost:1488). `docker compose down` stoppt das Vereinsheim. Nur das Image, ohne Compose:

```bash
docker build -t secret-nils .
docker run --rm -p 1488:1488 secret-nils
```

Das Image baut die Oberfläche, installiert danach nur die Laufzeitabhängigkeiten und startet `npm start`. Der Container prüft `/health`. Sitzungen liegen im Speicher: ein neuer Container beginnt mit leeren Vereinsheimen.

Zugzeit in der Lobby: 30, 45, 60, 90, 120 oder 180 Sekunden. Ohne rechtzeitige Aktion entscheidet die Sitzungsleitung kommissarisch (fehlende Stimme zählt als Ablehnung, Vorlagen und Sonderaktionen werden gezogen), damit eine Runde nicht stehen bleibt. Wer in der Lobby 90 Sekunden weg ist, verliert den Platz. Ein vollständig verlassenes Spiel wird nach 10 Minuten geschlossen. Der Ausweis (Token im `localStorage`) holt dieselbe Person zurück, solange die Sitzung existiert.

## Tests

`npm test` prüft unter anderem:

- Rollen 5–10 und wer wen kennt
- dass Kartentexte, Stapel und fremde Rollen nicht in der Spielersicht stehen
- Mehrheit, Gleichstand, Amtsperre, Notverwaltung ohne Sonderaktion
- Veto bis in die Notverwaltung, abgelehnte Formfehler-Rüge
- Nils an der Kasse, Ausschluss von Nils, sechs Eigeninteresse-Beschlüsse, fünf Vereinswohl-Beschlüsse
- Sondersitzung und Rückkehr des Vorsitzes
- zufällige Partien für jede Tischgröße bis zum Spielende
- Lobby: Startbedingungen, Kick, Vorstandswechsel, Reconnect, Timer, leere Räume
- einen echten Socket-Lauf mit fünf Clients
