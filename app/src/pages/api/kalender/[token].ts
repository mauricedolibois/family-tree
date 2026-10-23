// Birthday calendar subscription (iCalendar). No login, protected by the secret
// token in the link, because calendar apps cannot sign in.
// ?linie=…&vorfahren=…&nachkommen=…&seiten=… limits it to one person's line
// (see src/family/calendarLink.ts).

import type { NextApiRequest, NextApiResponse } from 'next'
import { getTreeByCalendarToken, loadTree } from '@/lib/db'
import { birthdayCalendar } from '@/family/ical'
import { calendarLocale, calendarSubset, parseCalendarQuery } from '@/family/calendarLink'
import { MESSAGES } from '@/i18n/messages'
import { logError } from '@/lib/log'

const TOKEN = /^[A-Za-z0-9_-]{20,64}$/

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    return res.status(405).end()
  }
  const raw = typeof req.query.token === 'string' ? req.query.token.replace(/\.ics$/, '') : ''
  if (!TOKEN.test(raw)) return res.status(404).end()

  try {
    const family = await getTreeByCalendarToken(raw)
    if (!family) return res.status(404).end()
    const loaded = await loadTree(family.id)
    if (!loaded) return res.status(404).end()

    const { tree, personName } = calendarSubset(loaded.tree, parseCalendarQuery(req.query))
    const locale = calendarLocale(req.query)
    const t = MESSAGES[locale].calendar
    const calendarName = personName ? t.lineName(personName) : t.familyName(family.name)
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
