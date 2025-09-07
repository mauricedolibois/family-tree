import type { NextApiRequest, NextApiResponse } from 'next'
import bcrypt from 'bcryptjs'
import { serialize } from 'cookie'
import { createFamily, getFamilyByName } from '@/lib/db'
import { startApiLog } from '@/lib/apiLogger' // ⬅️ add

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const log = startApiLog(req, '/api/auth/register')

  try {
    if (req.method !== 'POST') {
      await log.end(405, { msg: 'method not allowed' })
      return res.status(405).end()
    }

    const { familyName, password } = (req.body || {}) as { familyName?: string; password?: string }
    if (!familyName || !password) {
      await log.end(400, { error: 'missing fields' })
      return res.status(400).json({ error: 'missing fields' })
    }

    const exists = await getFamilyByName(familyName)
    if (exists) {
      await log.end(409, { error: 'family exists', familyName })
      return res.status(409).json({ error: 'family exists' })
    }

    const pass_hash = await bcrypt.hash(password, 10)
    const fam = await createFamily(familyName, pass_hash)

    res.setHeader(
      'Set-Cookie',
      serialize('fid', fam.id, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 365,
      })
    )

    await log.end(200, { ok: true, familyId: fam.id })
    return res.status(200).json({ ok: true })
  } catch (err) {
    await log.error(err, 500)
    return res.status(500).json({ error: 'internal error' })
  }
}
