// src/pages/api/auth/login.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import bcrypt from 'bcryptjs'
import { serialize } from 'cookie'
import { getFamilyByName } from '@/lib/db'
import { auditMediaUsageByName, deleteKeys } from '@/lib/mediaAudit' // ⬅️ neu

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

  // Session-Cookie setzen
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

  // --- ASYNCHRONER MEDIA-GC (fire-and-forget) -------------------------------
  // WICHTIG: nicht awaiten, damit der Login nicht blockiert.
  // Hinweis: In streng serverlosen Umgebungen (z. B. Vercel) kann Ausführung nach
  // Response beendet werden. Falls nötig, lieber per Cron/Job-Route triggern.
  setTimeout(async () => {
    try {
      const report = await auditMediaUsageByName()

      // Optional: nur Dateien dieser Familie löschen:
      // const candidates = report.unreferencedKeys.filter(k => k.startsWith(fam.id + '/'))

      const candidates = report.unreferencedKeys // globaler GC über alle Familien
      if (candidates.length) {
        const n = await deleteKeys(candidates)
        console.log('[media-gc] login cleanup:', {
          total: report.total,
          referenced: report.referenced,
          unreferenced: report.unreferenced,
          deleted: n,
        })
      } else {
        console.log('[media-gc] login cleanup: nothing to delete')
      }
    } catch (err) {
      console.error('[media-gc] error during async cleanup:', err)
    }
  }, 0)
  // --------------------------------------------------------------------------

  return res.status(200).json({ ok: true })
}
