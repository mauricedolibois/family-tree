// Birthday calendar subscription link: GET returns it, POST issues a new one.

import type { NextApiRequest, NextApiResponse } from 'next'
import { getFamilyIdFromReq } from '@/lib/session'
import { getCalendarToken, renewCalendarToken } from '@/lib/db'
import { logError } from '@/lib/log'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  const fid = getFamilyIdFromReq(req)
  if (!fid) return res.status(401).json({ error: 'unauthorized' })
  try {
    if (req.method === 'GET') return res.status(200).json({ path: icsPath(await getCalendarToken(fid)) })
    if (req.method === 'POST') return res.status(200).json({ path: icsPath(await renewCalendarToken(fid)) })
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).end()
  } catch (err) {
    logError('api/kalender/link', err)
    return res.status(500).json({ error: 'internal error' })
  }
}

const icsPath = (token: string) => `/api/kalender/${token}.ics`
