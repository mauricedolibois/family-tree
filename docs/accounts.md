# Accounts, trees and invitations

Everyone signs in with their own email address and password. A person can belong
to several family trees; what they may do is set per tree.

| Role | May do |
| --- | --- |
| **Admin** (global) | Runs the server: accounts, admin rights, trees (create, rename, delete, import), memberships and open invitations of every tree on `/admin` (menu → Administration), and invitations for admin rights alone. Managing one tree (members, invitations, history) happens in that tree as its moderator; `/admin` lists every tree with "Join" or "Manage" for that. Sees and edits a tree's contents only as a member of it, like everyone else; whoever creates or imports a tree becomes its moderator. |
| **Moderator** (per tree) | Like an editor, and also invite people to the tree, change the roles of its members and remove them (`/tree/<id>/members`). |
| **Editor** (per tree) | Read and change the tree, upload photos, renew the calendar link. |
| **Viewer** (per tree) | Read the tree, use views, birthdays, PDF export and the calendar subscription. |

Viewers and editors can also be limited to **a part of the tree** (see below).

The server checks every request; the interface only hides what a role cannot use.
Trees someone has no access to answer with "not found", exactly like trees that do
not exist.

## Joining

People join through **invitation links**, created by a tree's moderators on its
members tab (menu → "Manage <tree>", or "Access …" in a person's info
sheet), or by admins on `/admin` for admin rights alone:

- for one tree with a role, optionally also with admin rights (only admins grant
  them), or for admin rights without a tree (`/admin`);
- into a tree always **for a person in the tree** ("Who is this person in
  the family tree?"): accepting links the new account to that person without
  asking, and the introduction starts with "That's you" instead of asking who
  they are;
- with **what the person may do**, chosen as one of these (each sets the role and
  the part of the tree):

  | Choice | Role | Part |
  | --- | --- | --- |
  | See the whole tree | viewer | whole tree |
  | Help keep the whole tree | editor | whole tree |
  | Add their own family | editor | their blood line with all side lines (their whole family of origin) and their descendants; the rest of the tree visible, not changeable |
  | See only their own line | viewer | their blood line with siblings, the rest hidden |
  | Moderator | moderator | whole tree |
  | Custom | as chosen | role and part editor (below) |

  "Add their own family" is meant for people who married in, and is marked as
  recommended when the person's own blood family in the tree is smaller than their
  spouse's. With a part, the form shows its preview; tapping a person there turns
  the choice into "Custom" with that change;
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
families). Spouses belong to a line, in side lines too, so someone who married in
can add their sister's husband; a spouse with their own family in the tree gets
their details only (see the levels below), so nobody reaches that family through
them. A new custom part starts with the line of the invited person and their
siblings. A part starts with
one line and grows by adding the line of another person. Parts set before lines
existed (a start person with side lines) are read as one such line.

Per member the moderator chooses:

- **rest hidden** (always for viewers): the member gets only their part, in the
  tree, in the download and for photos; the birthday calendar is not offered,
  because its feed holds every birthday of the tree;
- **rest visible** (editors only): the member sees everything but changes only
  their part.

Every person of the part has one of **three levels**:

- **Edit**: everything, including adding relatives and deleting.
- **Details only**: name, dates, texts and photos, but no relatives added and not
  deleted, so the family beyond stays untouched. People at the edge of the part
  get it by themselves: those on whom family lines outside the part hang, for
  example a grandfather whose other son is not in the part, a married sister whose
  husband and children are not shared, or the topmost ancestor when their parents
  are beyond the chosen generations.
- **View only**: someone who married into a line (they belong to their own
  family), and anyone the moderator sets so.

The people the lines start from always have full rights. A couple can still get
a new child when one of the two may not be changed. In the info sheet the member
sees why they may change only the details, the "add" buttons are greyed out, and
they can **ask for access**. "Add" buttons for relatives who would fall outside
the part are greyed out the same way, with a note that a moderator can extend the
part (and "ask for access" where that helps, for children): a moderator then sees "Lisa asks for access to
Thomas and descendants" with what would change, and confirms or rejects it.

Further tools in the editor:

- **Up to here**: the part ends at a person; they belong to it, nobody beyond them
  (details only when there are people beyond).
- **Level per person**: tapping a person in the preview offers edit, details only
  or view only; their default is marked. Full rights at the edge come with the
  blood line of the person beyond, which the preview offers as a button.
- **Help**: the "i" next to "Access", the side lines and the preview explains the
  choices with examples, on hover or tap.
- **Preview**: a small tree with every person's level (view only with a clear
  red mark, details only dashed, not shared faded), a sentence like "sees 7
  people: 3 to edit, 2 details only, 2 view only", and a list that says why.
  Changing an existing part shows before saving who is newly shared, who gets more
  or fewer rights and who is no longer shared.
- **View as**: the eye next to a member opens the real tree exactly as they see it,
  read only.

New people can only be added where they stay within the part, so the member can
still edit them afterwards: the interface offers "add" only there, and the server
refuses anything else. A new sibling, for example, needs the side line "siblings".

The server enforces it (`app/src/family/scope.ts`): it cuts what it sends, telling
which people have details only or view only (only visible in the whole tree), and
on saving it takes over only the people of the part and new people linked to
them; everything else
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

Moderators open the **history** (menu → "Manage <tree>" → History): every version with
what changed, who and when, newest first. **Restore** sets the whole tree back to
a version; the current one is saved first, so a restore can be undone the same
way. **Download** gives a version as a ZIP file with its photos.

## Download and import

Everyone in a tree can download it with all photos as a ZIP file (menu →
Download). Admins turn such a file, or a JSON backup from earlier versions of the
app, into a new tree on `/admin`; moderators can replace their tree with one in the
history tab ("For developers"), after an automatic backup. Photos come along only in ZIP files;
links in a JSON backup to photos of trees the importing person cannot see are
dropped.

## Sessions and security

- Passwords: bcrypt with cost 12. New ones (registration, invitation, reset, change)
  need at least 10 characters and at most 72 bytes, may not be one of the 1000 most
  used long passwords, a common word with digits or symbols around it
  ("Sommer2024!"), a repetition or a keyboard run, nor the person's name or email
  address (`app/src/lib/passwordRules.ts`). Forms and server check the same rules;
  existing passwords keep working.
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
4. On `/admin`, **join** the existing tree (as moderator), then **invite the
   family** under "Manage <tree>", as editors or viewers.

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
