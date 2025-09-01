// src/pages/api/auth/logout.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { clearFamilyCookie } from '@/lib/accounts'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  clearFamilyCookie(res)
  res.status(200).json({ ok: true })
}
