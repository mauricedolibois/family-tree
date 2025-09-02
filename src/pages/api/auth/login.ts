import type { NextApiRequest, NextApiResponse } from 'next'
import bcrypt from 'bcryptjs'
import { serialize } from 'cookie'
import { getFamilyByName } from '@/lib/db'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { familyName, password } = (req.body || {}) as { familyName?: string; password?: string }
  if (!familyName || !password) {
    return res.status(400).json({ error: 'missing fields' })
  }

  const fam = await getFamilyByName(familyName)
  if (!fam) return res.status(401).json({ error: 'invalid credentials' })

  const ok = await bcrypt.compare(password, fam.pass_hash)
  if (!ok) return res.status(401).json({ error: 'invalid credentials' })

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

  return res.status(200).json({ ok: true })
}
