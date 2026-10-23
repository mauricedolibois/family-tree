// Liveness probe for the Docker health check. Only checks that the server
// responds; restarting the app would not help if the database is down.

import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({ ok: true })
}
