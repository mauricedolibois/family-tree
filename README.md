# Stammbaum

Ein privater Familien-Stammbaum im Stil einer alten Familienbibliothek: Pergament, Tinte, Blattgold.
Jede Familie meldet sich mit Familienname und Passwort an und pflegt ihren Baum gemeinsam, am Handy wie am Computer.

## Was die App kann

- **Übersichtlicher Baum ohne Linien-Knoten.** Die Anordnung berechnet [ELK](https://eclipse.dev/elk/) im Hintergrund (Web Worker): Generationen in Zeilen, Paare nebeneinander, Geschwister samt Familien nach Alter. Die Reihenfolge folgt einer Ahnentafel: Herkunft des Mannes links, der Frau rechts, Seitenzweige außen (`app/src/family/layout/order.ts`).
- **Goldene Linie:** Tippt man eine Person an, leuchten ihre Vorfahren und Nachkommen auf.
- **Ansichten:** ganze Familie, „Meine Linie“ oder die Linie einer beliebigen Person. Wie weit die Linie reicht, lässt sich einstellen: Generationen nach oben und unten, dazu Geschwister, Cousins oder alle Blutsverwandten.
- **Beziehung:** zwei Personen wählen, der Baum zeigt nur noch den Weg zwischen ihnen, dazu die Bezeichnung in beide Richtungen und die gemeinsamen Vorfahren.
- **„Wie sind wir verwandt?“** Mit „Das bin ich“ zeigt jede Person, wer sie für dich ist, z. B. „Dein Urgroßvater“ oder „Deine Cousine 2. Grades“. Das wird nur auf dem eigenen Gerät gemerkt und live berechnet, nicht in den Daten gespeichert.
- **Suche**, die direkt zur Person springt.
- **Einführung beim ersten Besuch:** „Wer bist du?“, dann Schritt für Schritt am eigenen Eintrag – Angaben ergänzen, Foto, Kind hinzufügen, die eigene Linie, die Beziehungsansicht. Jeder Schritt lässt sich ausprobieren oder überspringen; neu starten über das Menü.
- **Personen hinzufügen** direkt aus dem Infoblatt: Kind, Ehepartner, Elternteil.
- **Fotos und Dokumente** pro Person; Fotos werden vor dem Hochladen verkleinert.
- **Tageslicht und Kerzenlicht** (heller und dunkler Modus).
- **Nächste Geburtstage** im Menü: alle Lebenden mit vollständigem Geburtsdatum nach Monaten, mit Alter und – nach „Das bin ich“ – der Verwandtschaft; ein Tipp springt zur Person.
- **Geburtstage als Kalender-Abo** (Kalender-Knopf bei „Nächste Geburtstage“ und am Ende der Einführung): für iPhone/Mac, Google Kalender oder als Link für Outlook u. a. Ganztägige Termine „🎂 Name (Alter)“ mit Erinnerung um 9 Uhr; neue Einträge kommen von selbst dazu. Wahlweise die ganze Familie oder nur die eigene Linie – Person und Umfang stehen im Link:

  ```
  /api/kalender/<schlüssel>.ics?linie=<id>&vorfahren=alle&nachkommen=2&seiten=cousins
  ```

  `vorfahren`/`nachkommen`: Anzahl Generationen oder `alle`; `seiten`: `keine`, `geschwister`, `cousins` oder `alle`. Ohne `linie` die ganze Familie.

- **Verstorben, Datum unbekannt:** Schalter „Ist verstorben“ beim Bearbeiten (bzw. „Bereits verstorben“ beim Hinzufügen); das Sterbedatum ist dann freiwillig. Auf der Karte steht z. B. „1888–†“, die Person fällt aus Geburtstagen und Kalender heraus.
- **Als PDF exportieren** über das Menü: eigene Linie, Beziehung oder ganze Familie, hoch oder quer, A4 bis A1. Druckfertiges Blatt mit Goldrahmen, Titel und Datum; gesichert wird über den Druckdialog („Als PDF sichern“), dadurch bleibt alles vektorscharf.
- **Herkunftsflagge** bei jeder Person mit eingetragenem Land.
- **Sicherung herunterladen** als JSON über das Menü.

## Sicherheit und Daten

- Anmeldung mit signiertem Sitzungs-Cookie (HMAC), Bremse gegen Passwort-Raten.
- Der Server prüft jeden Baum vor dem Speichern. Gespeichert wird nur, wenn niemand den Baum zwischendurch auf einem anderen Gerät geändert hat.
- Automatische Sicherungen: vor **jeder** Änderung (mit Notiz, was danach geändert wurde, z. B. „bearbeitet: Karl Niehren“) und täglich per Cron auf dem Server (siehe [Deployment](#deployment)). Die Sicherungen vor Änderungen bleiben 90 Tage, die täglichen ein Jahr, von Hand angelegte für immer.
- Zurückholen im Notfall, im SQL-Editor von Supabase (Schema `verwaltung`, nicht über die API erreichbar):

  ```sql
  select * from verwaltung.staende limit 20;         -- letzte gesicherte Stände
  select verwaltung.wiederherstellen(NUMMER);         -- nur Vorschau: was würde passieren?
  select verwaltung.wiederherstellen(NUMMER, true);   -- wirklich zurückholen (der aktuelle Stand wird vorher gesichert)
  select verwaltung.sichern('vor dem Familienfest');  -- jetzt von Hand sichern
  ```

  `NUMMER` durch die `id` aus der Liste ersetzen – es steht absichtlich dort, damit sich die Zeilen nicht versehentlich unverändert ausführen lassen. Ohne `true` zeigt die Funktion nur eine Vorschau und ändert nichts.

- Fotos und Dokumente werden nicht sofort gelöscht, wenn jemand sie entfernt: Die tägliche Sicherung löscht eine Datei erst, wenn weder der aktuelle Baum noch eine Sicherung sie kennt (und sie älter als eine Woche ist). Zurückgeholte Stände behalten so ihre Bilder. Fehlt doch einmal eine Datei, zeigt die App die Initialen bzw. „Bild fehlt“.

- Kalender-Apps können sich nicht anmelden, deshalb ist das Abo nur durch einen geheimen Schlüssel im Link geschützt (`families.calendar_token`). Wer den Link hat, sieht Namen und Geburtstage; „Neuen Link erzeugen“ macht den alten ungültig.

- Die Datenbank (Supabase) wird nur serverseitig mit dem Service-Role-Key angesprochen; öffentliche Rollen haben keine Rechte.

## Entwicklung

```bash
cd app
npm ci
npm run dev        # http://localhost:3000
npm test           # Tests (Verwandtschaft, Layout, Sitzung, Prüfung der Daten)
npm run typecheck
npm run lint       # ESLint 9 (eslint.config.mjs)
npm run format     # Prettier
```

Dieselben Prüfungen laufen in der CI bei jedem Merge Request und vor jedem Deploy (Job `test`).

Benötigte Umgebungsvariablen (lokal in `app/.env.local`, auf dem Server in `prod.env`, Vorlage: `example.env`):

```
SUPABASE_URL=…
SUPABASE_SERVICE_ROLE_KEY=…
# optional, sonst aus dem Service-Role-Key abgeleitet:
SESSION_SECRET=…
# optional: Anlegen neuer Stammbäume abschalten (Standard: erlaubt)
ALLOW_REGISTRATION=false
# optional: Anzahl eigener Reverse-Proxys vor der App (Standard 1 = ein nginx; 0 = ohne Proxy)
TRUSTED_PROXIES=1
```

## Deployment

Über GitLab CI (`.gitlab-ci.yml`):

1. Merge Request oder Push auf `main` → Job `test` (Typecheck, Lint, Tests) und Job `audit` (`npm audit`, nur Warnung).
2. Push auf `main`, wenn `test` grün ist → Kaniko baut `app/Dockerfile` und schiebt das Image nach `registry.lptzocker.com/lptzocker/family-tree/family-tree:latest`.
3. Danach kopiert der Job `deploy` `docker-compose.yml` und `deploy_tools/deploy_prod.sh` auf den Server und startet den Container neu (`prod.env` liegt dort in `~/family-tree/`).

Das Image enthält nur den eigenständigen Next-Server (`output: 'standalone'`), läuft als Benutzer `node` und meldet über `/api/health` seinen Zustand an Docker (`docker ps` zeigt `healthy`).

Optional in GitLab unter *Build → Pipeline schedules* einen wöchentlichen Zeitplan für `main` anlegen: Geplante Pipelines führen nur `audit` aus und warnen bei neuen kritischen Sicherheitslücken – kein Build, kein Deploy.

Supabase läuft selbst gehostet auf demselben Host (`supabase-project/`).

**Datenbank-Migrationen** (`supabase/migrations/`): Die App läuft auch ohne sie mit dem Stand von `main` weiter. Erst mit ihnen kommen die Sicherung vor jeder Änderung, die Bremse gegen Passwort-Raten und das Kalender-Abo dazu. Einspielen, der Reihe nach, direkt in den Datenbank-Container:

```bash
for f in supabase/migrations/*.sql; do docker exec -i supabase-db psql -U postgres -v ON_ERROR_STOP=1 < "$f"; done
```

Die Migrationen lassen sich gefahrlos mehrfach ausführen.

**Hinweise:**

- Optional `SESSION_SECRET` (mind. 32 Zeichen) in `prod.env` ergänzen. Ohne wird er aus dem Service-Role-Key abgeleitet. Nach dem Update müssen sich alle einmal neu anmelden.
- Die App muss über HTTPS erreichbar sein, weil das Sitzungs-Cookie in Produktion als `Secure` gesetzt wird.
- nginx muss die Besucher-IP in `X-Forwarded-For` anhängen (`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`, in `proxy_params` schon enthalten). Die App wertet nur den letzten Eintrag aus, den Anfang kann der Besucher fälschen.
- Steht HTTP-Auth vor der App, braucht `location /api/kalender/` ein `auth_basic off;` – Kalender-Apps können sich nicht anmelden, der Link ist durch seinen geheimen Schlüssel geschützt.

**Tägliche Sicherung** (braucht die Migrationen): per Cron auf dem Server im App-Container, mit `prod.env` und Netzwerk der laufenden App, z. B. `crontab -e`:

```
0 3 * * * cd ~/family-tree && docker compose --env-file prod.env run --rm app node scripts/daily-backup.mjs >> ~/family-tree/backup.log 2>&1
```

`app/scripts/keep-alive.mjs` ist nur für kostenlose Supabase-Cloud-Projekte nötig, die nach 7 Tagen ohne Zugriff pausiert werden. Selbst gehostet braucht es das nicht.

## Aufbau

| Ordner                     | Inhalt                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `app/src/family/`              | Stammbaum-Logik ohne Oberfläche: Beziehungen, Verwandtschaftsnamen, Bearbeiten, Layout |
| `app/src/components/tree/`     | Baum-Ansicht: Karten, Linien, Zoom                                                     |
| `app/src/components/person/`   | Infoblatt, Bearbeiten, Personen hinzufügen                                             |
| `app/src/components/print/`    | PDF-Export (Druckblatt)                                                                |
| `app/src/components/relation/` | Beziehungsansicht: zwei Personen wählen, Bezeichnung                                   |
| `app/src/components/app/`      | Datenzustand, Kopfzeile, Suche                                                         |
| `app/src/components/ui/`       | Bausteine des Style-Systems                                                            |
| `app/src/styles/tokens.css`    | Farben des Style-Systems „Pergament & Tinte“                                           |
| `app/src/pages/api/`           | Anmeldung, Stammbaum, Uploads                                                          |
| `supabase/migrations/`     | Datenbank-Änderungen                                                                   |
