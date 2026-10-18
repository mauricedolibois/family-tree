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
- **Personen hinzufügen** direkt aus dem Infoblatt: Kind, Ehepartner, Elternteil.
- **Fotos und Dokumente** pro Person; Fotos werden vor dem Hochladen verkleinert.
- **Tageslicht und Kerzenlicht** (heller und dunkler Modus).
- **Sicherung herunterladen** als JSON über das Menü.

## Sicherheit und Daten

- Anmeldung mit signiertem Sitzungs-Cookie (HMAC), Bremse gegen Passwort-Raten.
- Der Server prüft jeden Baum vor dem Speichern. Gespeichert wird nur, wenn niemand den Baum zwischendurch auf einem anderen Gerät geändert hat.
- Automatische Sicherungen: vor dem Speichern (alle 6 Stunden und immer, wenn Personen wegfallen) und täglich über den Workflow `.github/workflows/keep-alive.yml`.
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
| `src/components/relation/` | Beziehungsansicht: zwei Personen wählen, Bezeichnung                                   |
| `src/components/app/`      | Datenzustand, Kopfzeile, Suche                                                         |
| `src/components/ui/`       | Bausteine des Style-Systems                                                            |
| `src/styles/tokens.css`    | Farben des Style-Systems „Pergament & Tinte“                                           |
| `src/pages/api/`           | Anmeldung, Stammbaum, Uploads                                                          |
| `supabase/migrations/`     | Datenbank-Änderungen                                                                   |
