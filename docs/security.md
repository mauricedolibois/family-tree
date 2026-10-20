# Security model

The app is meant to be reachable from the internet without anything in front of
it. Everything below is enforced on the server; the interface only hides what a
role cannot use.

## Who may do what

Access to a tree is checked on every request (`treeAccess` in `app/src/lib/auth.ts`):
admins have access to every tree, everybody else through a membership. **Nobody**,
admins included, has access to a tree that does not exist or is in the trash.
Trees without access answer exactly like trees that do not exist (404), so tree
ids cannot be probed.

| Endpoint | Not signed in | Viewer | Editor | Moderator | Other trees' members | Admin |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/trees/<id>` tree contents | 401 | ✓ | ✓ | ✓ | 404 | ✓ |
| `PUT /api/trees/<id>` save | 401 | 403 | ✓ | ✓ | 404 | ✓ |
| `GET /api/trees/<id>/calendar` subscription link | 401 | ✓ | ✓ | ✓ | 404 | ✓ |
| `POST /api/trees/<id>/calendar` new link | 401 | 403 | ✓ | ✓ | 404 | ✓ |
| `POST /api/trees/<id>/media` upload | 401 | 403 | ✓ | ✓ | 404 | ✓ |
| `GET /api/media/<id>/<file>` photo or document | 404 | ✓ | ✓ | ✓ | 404 | ✓ |
| `GET /api/trees/<id>/export` ZIP with photos | 401 | ✓ | ✓ | ✓ | 404 | ✓ |
| `GET /api/trees/<id>/members`, invitations, roles | 401 | 403 | 403 | ✓ | 404 | ✓ |
| `POST /api/trees/<id>/import` replace from file | 401 | 403 | 403 | ✓ | 404 | ✓ |
| `POST /api/trees/import` new tree from file | 401 | 403 | 403 | 403 | 403 | ✓ |
| `/api/admin/…` accounts, trees, trash, invitations | 401 | 403 | 403 | 403 | 403 | ✓ |
| `GET /api/kalender/<token>.ics` calendar feed | by secret token (192 bit), no sign-in |
| `/api/invite/<token>` | by secret token (256 bit), attempts throttled |
| `/api/auth/…` sign-in, registration, reset, verification | open, throttled per address and IP; reset and verification by secret token |
| `GET /api/health` | open, says nothing but "ok" |

`supabase/check.sh` covers the database side; the end-to-end checks used during
development run this table against every role, including deleted trees.

Further limits:

- Moderators manage everyone in their tree except themselves, never hand out
  admin rights and do not see invitations that grant them; 20 invitations per hour.
- Media links in a tree can point to files of other trees, but the file is only
  served, exported or copied on import for people who may see *that* tree.
- Uploaded and imported files: images, common videos and PDFs only, served with
  their type and `nosniff`; anything else that is stored from older versions is
  only offered as a download.
- Imports: at most 200 MB per file, 25 MB per photo, 2000 files and 1 GB unpacked
  (checked before unpacking, against ZIP bombs); the tree is validated like any
  save, and a failed import leaves nothing behind.

## Sessions and requests

- Session cookie: signed (HMAC), `HttpOnly`, `Secure`, `SameSite=Lax`, with a
  per-user epoch that ends all sessions on password change, reset, "sign out
  everywhere" or when an account is disabled. Users are loaded on every request,
  so lost admin rights or removed memberships apply at once.
- Changes through the API are only accepted from the app's own pages
  (`Sec-Fetch-Site: same-origin`, `app/src/middleware.ts`); `SameSite=Lax` alone
  would still let other subdomains of the same domain send them.
- Content Security Policy, HSTS, `X-Frame-Options: DENY`, `nosniff` on every
  response; passwords with bcrypt (cost 12); tokens stored only as SHA-256 hashes.

## Data

- The database is only used server side with the service role key; the API roles
  `anon` and `authenticated` have no rights and RLS blocks them as well.
- Photos lie in a private bucket and are only served through the app, so Supabase
  itself does not need to be reachable from the internet ([supabase.md](supabase.md)).
- Deleted trees go to a trash first: hidden from everyone, restorable by admins,
  removed for good with backups and files by an admin or after 30 days by the
  daily job.

## What it does not cover

- Photos someone has already seen may stay in their browser cache for up to a
  week after they lose access (files never change, so they are cached long).
- Viewers can still download everything they see (export, JSON backup); that is
  the point of being a member, not a gap.
- The Supabase secrets themselves (`supabase.md`, step 4).
