// Birthday calendar subscription (iCalendar). No login, protected by the secret
// token in the link, because calendar apps cannot sign in.
// The tree's token gives the whole tree; a member's own token (members whose part
// hides the rest) gives what that member sees at the time of the request.
// ?linie=…&vorfahren=…&nachkommen=…&seiten=… limits it to one person's line
// (see src/family/calendarLink.ts).

import type { NextApiRequest, NextApiResponse } from 'next'
import { getMemberByCalendarToken, getTreeByCalendarToken, loadTree } from '@/lib/db'
import { getTree, getUser, membershipIn } from '@/lib/accounts'
import { viewFor } from '@/family/scope'
import type { Tree } from '@/family/model'
import { birthdayCalendar } from '@/family/ical'
import { calendarLocale, calendarSubset, parseCalendarQuery } from '@/family/calendarLink'
import { MESSAGES } from '@/i18n/messages'
import { logError } from '@/lib/log'

const TOKEN = /^[A-Za-z0-9_-]{20,64}$/

/**
 * Name and people of the calendar, or null when the link leads nowhere (any more).
 * A member's link follows their membership: a changed part shows at the next
 * refresh, and the link stops with the membership, a disabled account or a
 * deleted tree.
 */
async function calendarSource(token: string): Promise<{ name: string; tree: Tree } | null> {
  const family = await getTreeByCalendarToken(token)
  if (family) {
    const loaded = await loadTree(family.id)
    return loaded ? { name: family.name, tree: loaded.tree } : null
  }
  const member = await getMemberByCalendarToken(token)
  if (!member) return null
  const [user, tree, membership] = await Promise.all([
    getUser(member.userId),
    getTree(member.treeId),
    membershipIn(member.userId, member.treeId),
  ])
  if (!user || user.disabled_at || !tree || !membership) return null
  const loaded = await loadTree(tree.id)
  return loaded ? { name: tree.name, tree: viewFor(loaded.tree, membership.scope) } : null
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    return res.status(405).end()
  }
  const raw = typeof req.query.token === 'string' ? req.query.token.replace(/\.ics$/, '') : ''
  if (!TOKEN.test(raw)) return res.status(404).end()

  try {
    const source = await calendarSource(raw)
    if (!source) return res.status(404).end()

    const { tree, personName } = calendarSubset(source.tree, parseCalendarQuery(req.query))
    const locale = calendarLocale(req.query)
    const t = MESSAGES[locale].calendar
    const calendarName = personName ? t.lineName(personName) : t.familyName(source.name)
    const ics = birthdayCalendar(tree, { calendarName, locale })
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    res.setHeader('Content-Disposition', 'inline; filename="geburtstage.ics"')
    res.setHeader('Cache-Control', 'private, max-age=300')
    res.setHeader('X-Robots-Tag', 'noindex')
    return res.status(200).send(ics)
  } catch (err) {
    logError('api/kalender', err)
    return res.status(500).end()
  }
}
