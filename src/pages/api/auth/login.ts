// src/pages/api/auth/login.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { loginFamily, setFamilyCookie } from '@/lib/accounts'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const { name, password } = req.body || {}
  if (!name || !password) return res.status(400).json({ error: 'name & password required' })
  try {
    const acc = await loginFamily(name, password)
    setFamilyCookie(res, acc.id)
    res.status(200).json({ id: acc.id, name: acc.name })
  } catch (e: any) {
    res.status(401).json({ error: e.message || 'login failed' })
  }
}
