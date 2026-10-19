# Family Tree

A private family tree styled like an old family library: parchment, ink and gold leaf.
Everyone has their own account, can belong to several family trees and maintains them together with the family, on phones and computers alike. See [docs/accounts.md](docs/accounts.md).

The interface speaks German, English, French and Spanish; see [docs/i18n.md](docs/i18n.md).

## Features

- **Clear tree without connector nodes.** [ELK](https://eclipse.dev/elk/) computes the layout in a web worker: generations in rows, couples side by side, siblings and their families ordered by age. The order follows a pedigree chart: the husband's family on the left, the wife's on the right, side branches on the outside (`app/src/family/layout/order.ts`).
- **Gold line:** tapping a person highlights their ancestors and descendants.
- **Views:** the whole family, "my line", or the line of any person. The reach of a line is adjustable: generations up and down, plus siblings, cousins or all blood relatives.
- **Relation:** pick two people and the tree shows only the path between them, with the kinship term in both directions and their common ancestors.
- **"How are we related?"** After choosing "that's me", every person shows who they are to you, e.g. "your great-grandfather" or "your second cousin". This is remembered on the device only and computed live, never stored with the data.
- **Search** that jumps straight to the person.
- **Guided tour on the first visit:** "who are you?", then step by step on your own entry: complete details, add a photo, add a child, your own line, the relation view. Every step can be tried or skipped; restart it from the menu.
- **Add relatives** right from the info sheet: child, spouse, parent.
- **Photos and documents** per person; photos are scaled down before upload.
- **Daylight and candlelight** (light and dark theme).
- **Four languages:** German, English, French and Spanish, including kinship terms, dates and the calendar subscription. Chosen on the sign-in page or in the menu, otherwise taken from the browser.
- **Upcoming birthdays** in the menu: all living people with a complete date of birth, grouped by month, with their age and, after "that's me", the kinship; a tap jumps to the person.
- **Birthdays as a calendar subscription** (calendar button under "upcoming birthdays" and at the end of the tour): for iPhone/Mac, Google Calendar, or as a link for Outlook and others. All-day events "🎂 Name (age)" with a reminder at 9 a.m.; new entries appear automatically. Either the whole family or only your own line; person and scope are part of the link:

  ```
  /api/kalender/<token>.ics?linie=<id>&vorfahren=alle&nachkommen=2&seiten=cousins
  ```

  `vorfahren`/`nachkommen` (ancestors/descendants): number of generations or `alle` (all); `seiten` (collateral lines): `keine` (none), `geschwister` (siblings), `cousins` or `alle`. Without `linie` the whole family. `lang` (`en`, `fr`, `es`) sets the language of the event texts; without it they are German. The route and parameter names stay German so existing subscriptions keep working.

- **Deceased, date unknown:** an "is deceased" switch when editing ("already deceased" when adding); the date of death becomes optional. The card shows e.g. "1888–†" and the person drops out of birthdays and the calendar.
- **Export as PDF** from the menu: your line, a relation or the whole family, portrait or landscape, A4 to A1. A print-ready sheet with gold frame, title and date, saved through the print dialog ("Save as PDF") so everything stays vector-sharp.
- **Country flag** for every person with a country of origin.
- **Download a backup** as JSON from the menu.

## Security and data

- Personal accounts with email and password; admins, editors and viewers per tree; invitation links; optional email verification and mail over SMTP ([docs/accounts.md](docs/accounts.md)).
- Signed session cookies (HMAC) that can be ended everywhere at once, and throttling against password guessing.
- The server validates every tree before saving, and only saves if nobody changed the tree on another device in the meantime.
- Automatic backups: before **every** change (with a note about what changed, e.g. "bearbeitet: Karl Niehren") and daily via cron on the server (see [Deployment](#deployment)). Pre-change backups are kept for 90 days, daily ones for a year, manual ones forever.
- Emergency restore from the Supabase SQL editor (schema `verwaltung`, not reachable through the API; the names are German):

  ```sql
  select * from verwaltung.staende limit 20;         -- latest backups
  select verwaltung.wiederherstellen(NUMMER);         -- preview only: what would happen?
  select verwaltung.wiederherstellen(NUMMER, true);   -- actually restore (the current version is backed up first)
  select verwaltung.sichern('vor dem Familienfest');  -- manual backup now
  select verwaltung.admin_invite('you@example.org');  -- one-time link for another admin
  ```

  Replace `NUMMER` with the `id` from the list. The placeholder is there on purpose so the lines cannot be run unchanged by accident. Without `true` the function only shows a preview and changes nothing.

- Photos and documents are not deleted right away when someone removes them: the daily backup only deletes a file once neither the current tree nor any backup refers to it (and it is older than a week), so restored versions keep their images. If a file is missing anyway, the app shows initials or "Bild fehlt" (image missing).

- Calendar apps cannot sign in, so the subscription is protected only by a secret token in the link (`families.calendar_token`). Anyone with the link sees names and birthdays; "create new link" invalidates the old one.

- The database (Supabase) is only accessed server side with the service role key; the public roles have no rights.

## Development

```bash
cd app
npm ci
npm run dev        # http://localhost:3000
npm test           # tests (kinship, layout, session, data validation)
npm run typecheck
npm run lint       # ESLint 9 (eslint.config.mjs)
npm run format     # Prettier
```

The same checks run in CI on every merge request and before every deploy (job `test`).

Environment variables (locally in `app/.env.local`, on the server in `prod.env`, template: `example.env`):

```
SUPABASE_URL=…
SUPABASE_SERVICE_ROLE_KEY=…
# optional, derived from the service role key otherwise:
SESSION_SECRET=…
# optional: let anyone sign up with a tree of their own (default: off, people join by invitation)
ALLOW_REGISTRATION=true
# optional: outgoing mail for invitations, password resets and verification (see docs/accounts.md)
MAIL_ENABLED=true
SMTP_HOST=…  SMTP_PORT=587  SMTP_USER=…  SMTP_PASSWORD=…  MAIL_FROM=…
APP_URL=https://tree.example.org
REQUIRE_EMAIL_VERIFICATION=true
# optional: number of own reverse proxies in front of the app (default 1 = one nginx; 0 = none)
TRUSTED_PROXIES=1
```

Code comments, test names and documentation are in English. User-facing texts live in `app/src/i18n/messages/` ([docs/i18n.md](docs/i18n.md)).

## Deployment

Through GitLab CI (`.gitlab-ci.yml`):

1. Merge request or push to `main` → job `test` (typecheck, lint, formatting, tests) and job `audit` (`npm audit`, warning only).
2. Push to `main` once `test` passes → Kaniko builds `app/Dockerfile` and pushes the image to `registry.lptzocker.com/lptzocker/family-tree/family-tree:latest`.
3. The `deploy` job then copies `docker-compose.yml` and `deploy_tools/deploy_prod.sh` to the server and restarts the container (`prod.env` lives in `~/family-tree/` there).

The image contains only the standalone Next server (`output: 'standalone'`), runs as user `node` and reports its state to Docker through `/api/health` (`docker ps` shows `healthy`).

Optionally add a weekly schedule for `main` in GitLab under *Build → Pipeline schedules*: scheduled pipelines only run `audit` and warn about new critical vulnerabilities. No build, no deploy.

### Database

The app needs a Supabase instance (self-hosted or cloud); it only talks to it through
`SUPABASE_URL` and the service role key and never needs database admin rights.
Everything the database needs is in one file, [`supabase/setup.sql`](supabase/setup.sql):

- **New installation:** run the whole file once in the Supabase SQL editor, then start
  the app. Nobody can sign in yet, so the app writes a one-time link for the first
  admin to its log:

  ```bash
  docker logs family-tree-app | grep setup
  ```

  Open the link (valid for 7 days), create your account and invite people on `/admin`.
- **Existing installation, also the original version with one shared password per
  family:** run the same file. It only adds what is missing and leaves trees, photos
  and accounts alone. After moving from a shared password, the app writes the admin
  link to its log as above.
- **Updates:** when a new app version needs database changes, the log, the admin page
  and the sign-in page say so. Run the current `supabase/setup.sql` again; it is safe
  to run any number of times and changes nothing if the database is already current.

The file runs in one transaction, so a failure changes nothing. With shell access to
the database container, `psql` works as well:
`docker exec -i supabase-db psql -U postgres -v ON_ERROR_STOP=1 < supabase/setup.sql`.

**Notes:**

- Optionally set `SESSION_SECRET` (at least 32 characters) in `prod.env`. Without it the key is derived from the service role key. Changing it signs everyone out once.
- The app must be served over HTTPS because the session cookie is `Secure` in production.
- nginx has to append the visitor IP to `X-Forwarded-For` (`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`, already part of `proxy_params`). The app only trusts the last entry; the visitor can forge the beginning.
- With HTTP basic auth in front of the app, `location /api/kalender/` needs `auth_basic off;`. Calendar apps cannot sign in; the link is protected by its secret token.

**Daily backup:** via cron on the server inside the app container, using `prod.env` and the running app's network, e.g. `crontab -e`:

```
0 3 * * * cd ~/family-tree && docker compose --env-file prod.env run --rm app node scripts/daily-backup.mjs >> ~/family-tree/backup.log 2>&1
```

`app/scripts/keep-alive.mjs` is only needed for free Supabase cloud projects, which are paused after 7 days without activity. Self-hosted instances do not need it.

## Project structure

| Folder                         | Contents                                                              |
| ------------------------------ | --------------------------------------------------------------------- |
| `app/src/family/`              | Tree logic without UI: relations, kinship terms, editing, layout      |
| `app/src/components/tree/`     | Tree view: cards, lines, zoom                                         |
| `app/src/components/person/`   | Info sheet, editing, adding relatives                                 |
| `app/src/components/print/`    | PDF export (print sheet)                                              |
| `app/src/components/relation/` | Relation view: pick two people, kinship term                          |
| `app/src/components/app/`      | Data state, header, search                                            |
| `app/src/components/ui/`       | Design-system building blocks                                         |
| `app/src/i18n/`                | Languages: detection, texts, provider                                 |
| `app/src/styles/tokens.css`    | Colours of the "parchment & ink" design system                        |
| `app/src/pages/api/`           | Accounts, trees, uploads, calendar, administration                    |
| `app/src/lib/`                 | Server side: database, accounts, sessions, mail, throttling           |
| `app/scripts/`                 | Maintenance scripts (daily backup, keep-alive)                        |
| `supabase/setup.sql`           | Database setup and upgrades (one file, safe to run again)             |

## Roadmap

1. ~~English codebase (comments, tests, documentation).~~
2. ~~Multilingual interface: German, English, French, Spanish.~~
3. ~~Personal accounts: sign-in with email, admins, invitation links, several trees per user, optional email verification and outgoing mail via SMTP.~~
