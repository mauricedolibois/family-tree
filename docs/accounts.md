# Accounts, trees and invitations

Everyone signs in with their own email address and password. A person can belong
to several family trees; what they may do is set per tree.

| Role | May do |
| --- | --- |
| **Admin** (global) | Runs the server: accounts, admin rights, trees (create, rename, delete, import), memberships and open invitations of every tree on `/admin`, and invitations for admin rights alone. People are invited into a tree on its members tab, so an admin who is no member adds themselves first. Sees and edits a tree's contents only as a member of it, like everyone else; whoever creates or imports a tree becomes its moderator. |
| **Moderator** (per tree) | Like an editor, and also invite people to the tree, change the roles of its members and remove them (`/tree/<id>/members`). |
| **Editor** (per tree) | Read and change the tree, upload photos, renew the calendar link. |
| **Viewer** (per tree) | Read the tree, use views, birthdays, PDF export and the calendar subscription. |

Viewers and editors can also be limited to **a part of the tree** (see below).

The server checks every request; the interface only hides what a role cannot use.
Trees someone has no access to answer with "not found", exactly like trees that do
not exist.

## Joining

People join through **invitation links**, created by a tree's moderators on its
members tab (menu → Administration → Members, or "Access …" in a person's info
sheet), or by admins on `/admin` for admin rights alone:

- for one tree with a role, optionally also with admin rights (only admins grant
  them), or for admin rights without a tree (`/admin`);
- into a tree always **for a person in the tree** ("Who is this person in
  the family tree?"): accepting links the new account to that person without
  asking, the part of the tree starts with their blood line, and the introduction
  starts with "That's you" instead of asking who they are;
- optionally bound to an email address (then only that address can use it, and it
  counts as verified);
- valid for 1 to 30 days and usable once; open invitations can be revoked.

With mail enabled and an address given, the invitation is mailed. Otherwise the
admin page shows the link to pass on. Someone who already has an account opens the
link while signed in and joins with one click.

Moderators manage everyone in their tree except themselves, so nobody locks
themselves out by accident; they cannot hand out admin rights and do not see
invitations that grant them. They can create 20 invitations per hour, because an
invitation can send mail to any address.

**Public registration** is off. With `ALLOW_REGISTRATION=true` anyone can sign up
at `/register` and gets a new tree of their own as its moderator.

## Who someone is in the tree

A membership can be **linked to a person** in the tree (one account per person):

- by the invitation, which names the person;
- by a moderator on the members page ("Link a person", "Other person", ×);
- by asking: a member without a link taps "That's me" on their card. Moderators are
  linked right away; for everyone else it is a request that a moderator or a
  **close relative with a linked account** (parent, child, sibling, spouse)
  confirms, in the bar under the top bar or on the members page.

The link makes "that's me" the same on every device (kinship, birthdays, "my
line"). People linked to an account are shown as such; only moderators can delete
them, which drops the link.

## Part of a tree

Moderators can limit a viewer or editor to a part of the tree: in the invitation,
on the members page (slider button next to the member) or from a person's info
sheet ("Access …"). A part is made of **blood lines**: a person with their
ancestors and descendants, each with its own number of generations up and down
and, if chosen, side lines (siblings, cousins, all blood relatives with their
families). Someone who married in gets their line with siblings, so they can add
their own brothers and sisters and their parents stay editable. A part starts with
one line and grows by adding the line of another person. Parts set before lines
existed (a start person with side lines) are read as one such line.

Per member the moderator chooses:

- **rest hidden** (always for viewers): the member gets only their part, in the
  tree, in the download and for photos; the birthday calendar is not offered,
  because its feed holds every birthday of the tree;
- **rest visible** (editors only): the member sees everything but changes only
  their part.

People of the part on whom family lines outside the part hang are **locked**: the
member sees them but cannot change them, delete them or add relatives to them.
Examples are a grandfather whose other son is not in the part, the topmost
ancestor when their parents are beyond the chosen generations, or someone who
married in and whose own parents are in the tree. Their info sheet shows a small
lock, the "add" buttons are greyed out, a short sentence explains why, and the
member can **ask for access**: a moderator then sees "Lisa asks for access to
Thomas and descendants" with what would change, and confirms or rejects it. The
people the lines start from are never locked. A couple can still get a new child
when one of the two is locked. Spouses of the lines' people who are no blood
relative of any line are shown but not editable.

Further tools in the editor:

- **Up to here**: the part ends at a person; they belong to it, nobody beyond them
  (they are locked when there are people beyond).
- **Exceptions per person**: "Allow editing anyway" for a locked person (their
  details and photos only; no relatives added, links unchanged, not deleted), and
  "Lock this person" for someone of the part.
- **Preview**: a small tree with every person's state (editable, locked with a
  clear red mark, not shared), a sentence like "sees 7 people, can edit 4, 3 are
  locked", and a list that says why someone is locked, with a button that adds the
  line that unlocks them. Changing an existing part shows what changes before
  saving.
- **View as**: the eye next to a member opens the real tree exactly as they see it,
  read only.

New people can only be added where they stay within the part, so the member can
still edit them afterwards: the interface offers "add" only there, and the server
refuses anything else. A new sibling, for example, needs the side line "siblings".

The server enforces it (`app/src/family/scope.ts`): it cuts what it sends, telling
which people are locked (only visible in the whole tree), and on saving it takes
over only the people of the part and new people linked to them; everything else
comes from the stored tree, so links to the hidden rest stay intact. Changes
outside the part are refused with a message. Moderators always have the whole
tree; making someone a moderator removes their part. If the start person (the
first line's person) is deleted, a member with the rest hidden sees nothing until a
moderator sets a new part. Limiting someone does not invalidate a calendar link
they already have: renew the link (birthday list → calendar) if that matters.

## Mail

| Variable | Meaning |
| --- | --- |
| `MAIL_ENABLED` | `true` to send mail at all |
| `SMTP_HOST`, `SMTP_PORT` | Mail server, port 587 by default |
| `SMTP_SECURE` | `true` for TLS from the start (port 465); default depends on the port |
| `SMTP_USER`, `SMTP_PASSWORD` | Login at the mail server, if it needs one |
| `MAIL_FROM` | Sender, e.g. `Family tree <tree@example.org>` |
| `APP_URL` | Public address used in links, e.g. `https://tree.example.org` |
| `REQUIRE_EMAIL_VERIFICATION` | `true`: new accounts confirm their address before signing in (needs mail) |

Links in mails are always built from `APP_URL`, never from the request: a forged
`Host` header must not be able to point password-reset links at another site.
Without `APP_URL` no mail is sent.

Without mail everything still works: invitation and reset links appear on the admin
page, and "forgot password" asks people to contact an admin.

Every mail is written in German and, below it, in English, so it does not matter
which language the recipient chose (or, for invitations, whether they have an
account yet). The languages are set in `MAIL_LOCALES` in `app/src/lib/mail.ts`.

## Deleting trees

Admins delete trees on `/admin`. A deleted tree goes to the trash first: from that
moment nobody sees it, not even admins outside the trash. Members find it gone
from their list; an open tab or an old link leads to the start page with a notice,
the calendar subscription stops and open invitations to it lapse. Admins can
restore it with everything in it, or delete it for good, which removes its
backups and photos too. The daily job does that on its own after 30 days.

## History and undo

Before every change, import and restore the whole tree is saved as a version,
with who made the change and what it did. Right after their own change, editors
see **Undo**: it saves the version from just before again, with the usual
conflict check, so it never overwrites what someone else changed meanwhile.

Moderators and admins open the **history** (menu → History): every version with
what changed, who and when, newest first. **Restore** sets the whole tree back to
a version; the current one is saved first, so a restore can be undone the same
way. **Download** gives a version as a ZIP file with its photos.

## Download and import

Everyone in a tree can download it with all photos as a ZIP file (menu →
Download). Admins turn such a file, or a JSON backup from earlier versions of the
app, into a new tree on `/admin`; moderators can replace their tree with one on
the members page, after an automatic backup. Photos come along only in ZIP files;
links in a JSON backup to photos of trees the importing person cannot see are
dropped.

## Sessions and security

- Passwords: at least 8 characters, bcrypt with cost 12.
- Sign-in is throttled per address and per IP; "forgot password" and invitation
  attempts are throttled too.
- The session cookie is signed and carries a per-user epoch. Changing the password,
  a reset, "sign out everywhere" and disabling an account raise the epoch and end
  every other session at once.
- Invitation, verification and reset tokens are 256-bit random values; only their
  SHA-256 hash is stored.
- The last active admin can neither lose admin rights nor be disabled or deleted.
- Changes through the API are only accepted from the app's own pages: browsers mark
  each request with `Sec-Fetch-Site`, and anything but `same-origin` is refused. The
  session cookie alone (`SameSite=Lax`) would still let other subdomains of the same
  domain send changes.

## Rollout on an existing installation

The original version used one shared password per family; now only personal
accounts can sign in.

1. **Back up the database** and run `supabase/migrations/v1_from_legacy.sql` in the
   Supabase SQL editor (see README, "Database"). Trees and backups are taken over.
2. **Deploy** the new version.
3. **Create the first admin:** while no account exists, the app writes a one-time
   link to its log on every start (`docker logs family-tree-app | grep setup`).
   Open it within 7 days and create your account. Without access to the log, the
   SQL editor gives you such a link too:

   ```sql
   select admin.invite_admin('you@example.org');
   ```

   It returns a path like `/invite/3f9c…`; open `https://<your domain>/invite/3f9c…`.
4. On `/admin`, add yourself to the existing tree as moderator, then **invite the
   family** on its members tab, as editors or viewers.

**HTTP basic auth in front of the app:** invited people would need its credentials
as well, before they even reach the invitation page. With personal accounts it is
no longer needed and can be removed from nginx. If you keep it, `location /api/kalender/`
still needs `auth_basic off;` for calendar subscriptions.

## When something goes wrong

- **An admin forgot their password:** another admin creates a reset link on
  `/admin`. If there is no other admin, create a new admin invitation in the SQL
  editor (`select admin.invite_admin('…');`) and use a new address, or sign in
  with mail and use "forgot password".
- **Someone left the family:** disable or delete the account on `/admin`, or just
  remove them from the tree. Their sessions end immediately.
- **A link leaked:** revoke open invitations on `/admin`; reset links expire after
  two hours and work once.
