# Security model

The app is meant to be reachable from the internet without anything in front of
it. Everything below is enforced on the server; the interface only hides what a
role cannot use.

## Who may do what

Access to a tree is checked on every request (`treeAccess` in `app/src/lib/auth.ts`)
and comes **only from a membership**, for admins too: admin rights are about running
the server, and everyone who can read a tree is listed among its members (admins
with a badge). Nobody has access to a tree that does not exist or is in the trash.
Trees without access answer exactly like trees that do not exist (404), so tree
ids cannot be probed.

| Endpoint | Not signed in | Viewer | Editor | Moderator | Not a member (admins included) | Admin |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/trees/<id>` tree contents | 401 | ✓ | ✓ | ✓ | 404 | by role |
| `PUT /api/trees/<id>` save | 401 | 403 | ✓ | ✓ | 404 | by role |
| `GET /api/trees/<id>/calendar` subscription link | 401 | ✓ | ✓ | ✓ | 404 | by role |
| `POST /api/trees/<id>/calendar` new link | 401 | 403 | ✓ | ✓ | 404 | by role |
| `POST /api/trees/<id>/media` upload | 401 | 403 | ✓ | ✓ | 404 | by role |
| `GET /api/media/<id>/<file>` photo or document | 404 | ✓ | ✓ | ✓ | 404 | by role |
| `GET /api/trees/<id>/download` ZIP with photos | 401 | ✓ | ✓ | ✓ | 404 | by role |
| `GET /api/trees/<id>/members`, invitations, roles, linked person | 401 | 403 | 403 | ✓ | 404 | by role |
| `GET /api/trees/<id>?as=<user>` view as a member (read only) | 401 | 403 | 403 | ✓ | 404 | by role |
| `GET`/`POST /api/trees/<id>/requests` own "that's me" and access requests | 401 | ✓ | ✓ | ✓ | 404 | by role |
| `PUT /api/trees/<id>/requests/<id>` confirm "that's me" | 401 | close relative | close relative | ✓ | 404 | by role |
| `PUT /api/trees/<id>/requests/<id>` decide access request | 401 | 403 | 403 | ✓ | 404 | by role |
| `/api/trees/<id>/history` versions, restore, download | 401 | 403 | 403 | ✓ | 404 | by role |
| `POST /api/trees/<id>/import` replace from file | 401 | 403 | 403 | ✓ | 404 | by role |
| `POST /api/trees/import` new tree from file | 401 | 403 | 403 | 403 | 403 | ✓ (becomes moderator) |
| `/api/admin/…` accounts, trees, trash, invitations | 401 | 403 | 403 | 403 | 403 | ✓ |
| `GET /api/trees` trees one can open | 401 | signed in: only trees with a membership, none from the trash |
| `/api/account` own account, `POST /api/account/logout-all` | 401 | signed in: only one's own account; a new email or password needs the current password |
| `GET /api/kalender/<token>.ics` calendar feed | by secret token (192 bit), no sign-in |
| `/api/invite/<token>` | by secret token (256 bit), attempts throttled |
| `/api/auth/…` sign-in, registration, reset, verification | open, throttled per address and IP; reset and verification by secret token |
| `GET /api/health` | open, says nothing but "ok" |

Members limited to **a part of the tree** (`scope` on the membership, see
`accounts.md`) are checked in the same places via `treeMembership`:

| Endpoint | Part, rest hidden | Part, rest visible |
| --- | --- | --- |
| `GET /api/trees/<id>` | only the part (`viewFor`) | everything |
| `PUT /api/trees/<id>` (editors) | merged by `mergeScopedSave`: only the part changes; people with details only keep their links and stay, view-only people and the lines' people stay, otherwise 403 | same |
| `GET /api/media/<id>/<file>` | only files of people in the part and own fresh uploads, otherwise 404 | everything |
| `GET /api/trees/<id>/download` | only the part | everything |
| `/api/trees/<id>/calendar` | 403 (the feed holds the whole tree) | link yes, renewing no |

Media of other trees are copied into exports and imports only from trees one sees
completely (`mayReadAllMedia`).

`supabase/check.sh` covers the database side; the end-to-end checks used during
development run this table against every role, including deleted trees.

Further limits:

- Moderators manage everyone in their tree except themselves, never hand out
  admin rights and do not see invitations that grant them; 20 invitations per hour.
  `POST /api/admin/invites` hands out admin rights alone; invitations into a tree
  come from its members tab and always name a person there.
- People linked to an account are deleted only by moderators (otherwise 403);
  the link goes with them, also when a restore or an import removes them, and
  open requests about them are closed, as are a member's own when they leave. One account per person and tree (unique index).
- "That's me" is confirmed only by a moderator or by a member whose linked person
  is a parent, child, sibling or spouse of the claimed person, never by the member
  who asked; a member has at most one open request of each kind.
- "View as" never saves: the client refuses, and the server answers 403 to
  anything but reading with `?as`.
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
  (`Sec-Fetch-Site: same-origin`, `app/src/proxy.ts`); `SameSite=Lax` alone
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
- Viewers can still download everything they see (the ZIP download); that is
  the point of being a member, not a gap.
- A part of a tree limits contents, not facts one can infer: a member sees that
  their start person has a spouse, that someone at the edge has relatives beyond
  the part (not who), and kinship labels only cover the people in their part. A
  calendar link they got before being limited keeps working until it is renewed.
- The Supabase secrets themselves (`supabase.md`, step 4).
