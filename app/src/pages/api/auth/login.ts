import type { NextApiRequest, NextApiResponse } from 'next'
import bcrypt from 'bcryptjs'
import { serialize } from 'cookie'
import { getFamilyByName } from '@/lib/db'
import { auditMediaUsageByName, deleteKeys } from '@/lib/mediaAudit'
import { startApiLog } from '@/lib/apiLogger' // ⬅️ add

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const log = startApiLog(req, '/api/auth/login')

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

    const fam = await getFamilyByName(familyName)
    if (!fam) {
      await log.end(401, { error: 'invalid credentials', familyName })
      return res.status(401).json({ error: 'invalid credentials' })
    }

    const ok = await bcrypt.compare(password, fam.pass_hash)
    if (!ok) {
      await log.end(401, { error: 'invalid credentials', familyId: fam.id })
      return res.status(401).json({ error: 'invalid credentials' })
    }

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

    // async media GC (fire-and-forget)
    setTimeout(async () => {
      try {
        const report = await auditMediaUsageByName()
        const candidates = report.unreferencedKeys
        if (candidates.length) {
          const n = await deleteKeys(candidates)
          console.log('[media-gc] login cleanup', { deleted: n })
        } else {
          console.log('[media-gc] login cleanup: nothing to delete')
        }
      } catch (err) {
        console.error('[media-gc] error during async cleanup:', err)
      }
    }, 0)

    await log.end(200, { ok: true, familyId: fam.id })
    return res.status(200).json({ ok: true })
  } catch (err) {
    await log.error(err, 500)
    return res.status(500).json({ error: 'internal error' })
  }
}
