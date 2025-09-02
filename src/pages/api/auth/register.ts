import type { NextApiRequest, NextApiResponse } from 'next'
import bcrypt from 'bcryptjs'
import { serialize } from 'cookie' // << named import
import { createFamily, getFamilyByName } from '@/lib/db' // oder deine DB-Helfer

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { familyName, password } = (req.body || {}) as { familyName?: string; password?: string }
  if (!familyName || !password) {
    return res.status(400).json({ error: 'missing fields' })
  }

  // Existiert schon?
  const exists = await getFamilyByName(familyName)
  if (exists) return res.status(409).json({ error: 'family exists' })

  // Hash + anlegen
  const pass_hash = await bcrypt.hash(password, 10)
  const fam = await createFamily(familyName, pass_hash)

  // Cookie setzen
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
