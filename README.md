# Stammbaum

Ein privater Familien-Stammbaum im Stil einer alten Familienbibliothek: Pergament, Tinte, Blattgold.
Jede Familie meldet sich mit Familienname und Passwort an und pflegt ihren Baum gemeinsam, am Handy wie am Computer.

## Was die App kann

- **Übersichtlicher Baum ohne Linien-Knoten.** Die Anordnung berechnet [ELK](https://eclipse.dev/elk/) im Hintergrund (Web Worker): Generationen in Zeilen, Paare nebeneinander, Geschwister samt Familien nach Alter. Die Reihenfolge folgt einer Ahnentafel: Herkunft des Mannes links, der Frau rechts, Seitenzweige außen (`src/family/layout/order.ts`).
- **Goldene Linie:** Tippt man eine Person an, leuchten ihre Vorfahren und Nachkommen auf.
- **Ansichten:** ganze Familie, „Meine Linie“ oder die Linie einer beliebigen Person. Wie weit die Linie reicht, lässt sich einstellen: Generationen nach oben und unten, dazu Geschwister, Cousins oder alle Blutsverwandten.
- **Beziehung:** zwei Personen wählen, der Baum zeigt nur noch den Weg zwischen ihnen, dazu die Bezeichnung in beide Richtungen und die gemeinsamen Vorfahren.
- **„Wie sind wir verwandt?“** Mit „Das bin ich“ zeigt jede Person, wer sie für dich ist, z. B. „Dein Urgroßvater“ oder „Deine Cousine 2. Grades“. Das wird nur auf dem eigenen Gerät gemerkt und live berechnet, nicht in den Daten gespeichert.
- **Suche**, die direkt zur Person springt.
- **Einführung beim ersten Besuch:** „Wer bist du?“, dann Schritt für Schritt am eigenen Eintrag – Angaben ergänzen, Foto, Kind hinzufügen, die eigene Linie, die Beziehungsansicht. Jeder Schritt lässt sich ausprobieren oder überspringen; neu starten über das Menü.
- **Personen hinzufügen** direkt aus dem Infoblatt: Kind, Ehepartner, Elternteil.
- **Fotos und Dokumente** pro Person; Fotos werden vor dem Hochladen verkleinert.
- **Tageslicht und Kerzenlicht** (heller und dunkler Modus).
- **Deutsch und Englisch:** Ohne eigene Wahl gilt die Sprache des Browsers (Deutsch, sonst Englisch); umschalten im Menü oder auf der Anmeldeseite. Texte stehen zweisprachig im Code (`t('Speichern', 'Save')`, `src/i18n/lang.tsx`), Verwandtschaftsbezeichnungen werden sprachunabhängig berechnet und dann benannt („Urgroßvater“ / „great-grandfather“).
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
- Automatische Sicherungen: vor **jeder** Änderung (mit Notiz, was danach geändert wurde, z. B. „bearbeitet: Karl Niehren“) und täglich über den Workflow `.github/workflows/keep-alive.yml`. Die Sicherungen vor Änderungen bleiben 90 Tage, die täglichen ein Jahr, von Hand angelegte für immer.
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
npm ci
npm run dev        # http://localhost:3000
npm test           # Tests (Verwandtschaft, Layout, Sitzung, Prüfung der Daten)
npm run typecheck
```

Benötigte Umgebungsvariablen (z. B. in `.env.local`):

```
NEXT_PUBLIC_SUPABASE_URL=…
SUPABASE_SERVICE_ROLE_KEY=…
# optional, sonst aus dem Service-Role-Key abgeleitet:
SESSION_SECRET=…
```

## Aufbau

| Ordner                     | Inhalt                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `src/family/`              | Stammbaum-Logik ohne Oberfläche: Beziehungen, Verwandtschaftsnamen, Bearbeiten, Layout |
| `src/components/tree/`     | Baum-Ansicht: Karten, Linien, Zoom                                                     |
| `src/components/person/`   | Infoblatt, Bearbeiten, Personen hinzufügen                                             |
| `src/components/print/`    | PDF-Export (Druckblatt)                                                                |
| `src/components/relation/` | Beziehungsansicht: zwei Personen wählen, Bezeichnung                                   |
| `src/components/app/`      | Datenzustand, Kopfzeile, Suche                                                         |
| `src/components/ui/`       | Bausteine des Style-Systems                                                            |
| `src/styles/tokens.css`    | Farben des Style-Systems „Pergament & Tinte“                                           |
| `src/pages/api/`           | Anmeldung, Stammbaum, Uploads                                                          |
| `supabase/migrations/`     | Datenbank-Änderungen                                                                   |
