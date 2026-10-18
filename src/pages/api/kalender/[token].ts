// Kalender-Abo der Geburtstage (iCalendar). Ohne Anmeldung, geschützt durch den
// geheimen Schlüssel im Link – Kalender-Apps können sich nicht einloggen.

import type { NextApiRequest, NextApiResponse } from 'next'
import { getFamilyByCalendarToken, loadFamilyTree } from '@/lib/db'
import { birthdayCalendar } from '@/family/ical'
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
    const family = await getFamilyByCalendarToken(raw)
    if (!family) return res.status(404).end()
    const loaded = await loadFamilyTree(family.id)
    if (!loaded) return res.status(404).end()

    const ics = birthdayCalendar(loaded.tree, { calendarName: `Geburtstage ${family.name}` })
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
