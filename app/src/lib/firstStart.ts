// Installation state for admins. At server start: report an outdated database and,
// on a fresh installation without any account, write a one-time link for the first
// admin to the log (`docker logs family-tree-app`), so nobody needs the SQL editor
// for it. The sign-in page shows the same state through setupNotice().

import { countUsers, createInvite } from './accounts'
import { appUrl } from './features'
import { schemaStatus } from './schema'
import { serviceKeyFromExample } from './supabaseServer'
import { hashToken, newToken } from './tokens'
import { logError } from './log'

const LINK_DAYS = 7

export type SetupNotice =
  { kind: 'missing' } | { kind: 'outdated'; have: number; need: number } | { kind: 'noAccount' } | null

// Once someone has an account this stays true; no need to count on every page view
let accountsExist = false

/** What the sign-in and admin pages should tell people about the installation */
export async function setupNotice(): Promise<SetupNotice> {
  const status = await schemaStatus()
  if (status.state === 'missing') return { kind: 'missing' }
  if (status.state === 'outdated') return { kind: 'outdated', have: status.have, need: status.need }
  if (status.state !== 'current' || accountsExist) return null
  try {
    accountsExist = (await countUsers()) > 0
  } catch (err) {
    logError('setup', err)
    return null
  }
  return accountsExist ? null : { kind: 'noAccount' }
}

export async function onServerStart(): Promise<void> {
  if (serviceKeyFromExample()) {
    console.warn(
      "[setup] SUPABASE_SERVICE_ROLE_KEY is signed with the JWT_SECRET from Supabase's example .env: anyone who " +
        'reaches Supabase can read the whole database, and without SESSION_SECRET anyone can forge sign-ins. ' +
        'Set new secrets (docs/supabase.md, step 4; supabase/check-secrets.sh).',
    )
  }
  try {
    const status = await schemaStatus()
    if (status.state === 'missing') {
      console.warn(
        '[setup] The database is empty. Run supabase/setup.sql in the Supabase SQL editor (see README, "Database").',
      )
      return
    }
    if (status.state === 'outdated') {
      console.warn(
        `[setup] The database is at version ${status.have}, this app needs version ${status.need}. ` +
          'Run the missing scripts from supabase/migrations in the Supabase SQL editor (see README, "Database").',
      )
      return
    }
    if (status.state !== 'current' || (await countUsers()) > 0) return

    // A new link on every start while nobody has signed up; older ones simply expire
    const token = newToken()
    await createInvite({
      tokenHash: hashToken(token),
      email: null,
      treeId: null,
      role: null,
      makeAdmin: true,
      createdBy: null,
      expiresAt: new Date(Date.now() + LINK_DAYS * 86_400_000),
    })
    const base = appUrl()
    console.log(
      `[setup] No account exists yet. Create the first admin within ${LINK_DAYS} days at:\n` +
        `[setup]   ${base ?? '<your app address>'}/invite/${token}`,
    )
  } catch (err) {
    logError('setup', err)
  }
}
