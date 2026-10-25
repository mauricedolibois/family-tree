# Private Supabase

Browsers never talk to Supabase: the app reads and writes the database on the
server, and since database version 2 it also serves photos and documents itself
(`/api/media/<tree>/<file>`, only for people who may see the tree). The storage
bucket is private. So Supabase does not have to be reachable from the internet at
all, and it should not be: its API, Studio and the database port are then only
protected by Supabase's own secrets.

This page describes the setup with a self-hosted Supabase on the same host as the
app, each in its own Docker Compose project. With Supabase cloud only step 1 applies.

## 1. Database version 2

Run `supabase/migrations/v2_private_media.sql` (after `v1_from_legacy.sql`, if that
has not run yet) and deploy the app version that needs it. From now on photos load
through the app. Old public links stop working; the script rewrote every stored link.

## 2. Talk to Supabase internally

In `prod.env` on the app host:

```bash
SUPABASE_URL=http://host.docker.internal:8000
```

`docker-compose.yml` maps `host.docker.internal` to the host, so the app reaches
Kong (Supabase's API gateway, port 8000) without leaving the machine. Restart and
check:

```bash
docker compose --env-file prod.env up -d
docker exec family-tree-app wget -qO- http://host.docker.internal:8000/rest/v1/ ; echo $?
# an error "401 Unauthorized" means Kong answers; "Connection refused" or a timeout means it does not
```

## 3. Close the public way in

- Remove the Supabase domain (server block) from nginx on the proxy host.
- In Supabase's `docker-compose.yml`, publish the ports only where they are needed
  instead of on every interface (`0.0.0.0`). Docker bypasses host firewalls such as
  ufw for published ports, so the binding is what counts:

  ```yaml
  kong:
    ports:
      - "127.0.0.1:8000:8000"   # SSH tunnel for Studio
      - "172.17.0.1:8000:8000"  # the app via host.docker.internal (docker0 address)
  ```

  `172.17.0.1` is Docker's default bridge address; check it with
  `ip -4 addr show docker0`. The pooler (5432/6543) and analytics (4000) are not
  used by the app: bind them to `127.0.0.1` or remove their `ports:` entries.
  Restart Supabase and repeat the check from step 2.
- Studio from your computer through SSH:

  ```bash
  ssh -L 8000:127.0.0.1:8000 <user>@<app-host>
  # then open http://localhost:8000 (Studio asks for DASHBOARD_USERNAME/PASSWORD)
  ```

## 4. Secrets

Supabase's `.env` must not contain the values from its example file. With the
example `JWT_SECRET` anyone can create a service key and read everything, and the
example `DASHBOARD_PASSWORD` opens Studio. Without its own `SESSION_SECRET` the app
derives its session key from the service key, so with the example secret anyone
could also forge sign-ins to the app.

Check it as the Linux user that runs Supabase:

```bash
supabase/check-secrets.sh ~/supabase/docker/.env
```

It compares every secret with the values Supabase's example files have shipped
(and with the `.env.example` next to the `.env`), checks that `ANON_KEY` and
`SERVICE_ROLE_KEY` are not signed with the example secret, and prints only the
names of what must change. The app checks its own key too: with a key signed with
the example secret it warns in its log and on the admin page.

Supabase ships a generator for new values (`utils/generate-keys.sh` in its docker
folder); afterwards put the new `SERVICE_ROLE_KEY` into the app's `prod.env` as
`SUPABASE_SERVICE_ROLE_KEY`. Changing the key also changes the session key if
`SESSION_SECRET` is not set, which signs everyone out once.
