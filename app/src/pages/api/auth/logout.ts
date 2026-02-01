import type { NextApiRequest, NextApiResponse } from 'next'
import { serialize } from 'cookie'
import { startApiLog } from '@/lib/apiLogger' // ⬅️ add

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const log = startApiLog(req, '/api/auth/logout')

  try {
    if (req.method !== 'POST') {
      await log.end(405, { msg: 'method not allowed' })
      return res.status(405).end()
    }

    res.setHeader(
      'Set-Cookie',
      serialize('fid', '', {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 0,
      })
    )

    await log.end(200, { ok: true })
    return res.status(200).json({ ok: true })
  } catch (err) {
    await log.error(err, 500)
    return res.status(500).json({ error: 'internal error' })
  }
}
