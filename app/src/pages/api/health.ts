// Lebenszeichen für den Docker-Healthcheck. Prüft bewusst nur, ob der Server antwortet:
// Ist die Datenbank weg, hilft ein Neustart der App nicht.

import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({ ok: true })
}
