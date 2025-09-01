// src/pages/api/auth/register.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { registerFamily, setFamilyCookie } from '@/lib/accounts'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const { name, password } = req.body || {}
  if (!name || !password) return res.status(400).json({ error: 'name & password required' })
  try {
    const acc = await registerFamily(name, password)
    setFamilyCookie(res, acc.id)
    res.status(201).json({ id: acc.id, name: acc.name })
  } catch (e: any) {
    res.status(400).json({ error: e.message || 'registration failed' })
  }
}
