// Installation state for admins. At server start: report an outdated database and,
// on a fresh installation without any account, write a one-time link for the first
// admin to the log (`docker logs family-tree-app`), so nobody needs the SQL editor
// for it. The sign-in page shows the same state through setupNotice().

import { countUsers, createInvite } from './accounts'
import { appUrl } from './features'
import { schemaStatus } from './schema'
import { hashToken, newToken } from './tokens'
import { logError } from './log'

const LINK_DAYS = 7

export type SetupNotice = { kind: 'outdated'; have: number; need: number } | { kind: 'noAccount' } | null

// Once someone has an account this stays true; no need to count on every page view
let accountsExist = false

/** What the sign-in and admin pages should tell people about the installation */
export async function setupNotice(): Promise<SetupNotice> {
  const status = await schemaStatus()
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
  try {
    const status = await schemaStatus()
    if (status.state === 'outdated') {
      console.warn(
        `[setup] The database is at version ${status.have}, this app needs version ${status.need}. ` +
          'Run supabase/setup.sql in the Supabase SQL editor (see README, "Database").',
      )
      return
    }
    if (status.state !== 'current' || (await countUsers()) > 0) return

    // A new link on every start while nobody has signed up; older ones simply expire
    const token = newToken()
    await createInvite({
      tokenHash: hashToken(token),
      email: null,
      familyId: null,
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
