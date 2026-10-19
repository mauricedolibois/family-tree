# Accounts, trees and invitations

Everyone signs in with their own email address and password. A person can belong
to several family trees; what they may do is set per tree.

| Role | May do |
| --- | --- |
| **Admin** (global) | Everything: every tree, accounts, invitations, new trees. Needs no membership. |
| **Editor** (per tree) | Read and change the tree, upload photos, renew the calendar link. |
| **Viewer** (per tree) | Read the tree, use views, birthdays, PDF export and the calendar subscription. |

The server checks every request; the interface only hides what a role cannot use.
Trees someone has no access to answer with "not found", exactly like trees that do
not exist.

## Joining

People join through **invitation links** created on `/admin`:

- for one tree with a role, for admin rights, or both;
- optionally bound to an email address (then only that address can use it, and it
  counts as verified);
- valid for 1 to 30 days and usable once; open invitations can be revoked.

With mail enabled and an address given, the invitation is mailed. Otherwise the
admin page shows the link to pass on. Someone who already has an account opens the
link while signed in and joins with one click.

**Public registration** is off. With `ALLOW_REGISTRATION=true` anyone can sign up
at `/register` and gets a new tree of their own as editor.

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

Mails go out in the recipient's language (the account language, set on `/account`
from the language picker; for invitations the inviting admin's language).

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

## Rollout on an existing installation

The original version used one shared password per family; now only personal
accounts can sign in.

1. **Run `supabase/setup.sql`** in the Supabase SQL editor (see README, "Database").
   Existing trees stay as they are.
2. **Deploy** the new version.
3. **Create the first admin:** while no account exists, the app writes a one-time
   link to its log on every start (`docker logs family-tree-app | grep setup`).
   Open it within 7 days and create your account. Without access to the log, the
   SQL editor gives you such a link too:

   ```sql
   select verwaltung.admin_invite('you@example.org');
   ```

   It returns a path like `/invite/3f9c…`; open `https://<your domain>/invite/3f9c…`.
4. On `/admin`, **invite the family** to the existing tree, as editors or viewers.

Rolling back stays possible: older versions ignore the new tables, and the old
family passwords are still stored.

**HTTP basic auth in front of the app:** invited people would need its credentials
as well, before they even reach the invitation page. With personal accounts it is
no longer needed and can be removed from nginx. If you keep it, `location /api/kalender/`
still needs `auth_basic off;` for calendar subscriptions.

## When something goes wrong

- **An admin forgot their password:** another admin creates a reset link on
  `/admin`. If there is no other admin, create a new admin invitation in the SQL
  editor (`select verwaltung.admin_invite('…');`) and use a new address, or sign in
  with mail and use "forgot password".
- **Someone left the family:** disable or delete the account on `/admin`, or just
  remove them from the tree. Their sessions end immediately.
- **A link leaked:** revoke open invitations on `/admin`; reset links expire after
  two hours and work once.
