// src/lib/rateLimit.ts
//
// Bremse gegen Passwort-Raten und Massen-Registrierungen.
// Versuche werden in der Tabelle `auth_attempts` gezählt (nur gehashte
// Schlüssel, keine Klartext-IPs). Fehlt die Tabelle, wird nicht blockiert,
// damit niemand ausgesperrt wird – der Fehler landet aber im Log.

import { createHmac } from 'crypto'
import type { IncomingMessage } from 'http'
import { supaAdmin } from '@/lib/supabaseServer'
import { logError } from '@/lib/log'

export type AttemptKind = 'login' | 'register'

function hashKey(value: string): string {
  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'family-tree'
  return createHmac('sha256', salt).update(value).digest('hex').slice(0, 32)
}

export function clientIp(req: Pick<IncomingMessage, 'headers' | 'socket'>): string {
  const forwarded = req.headers['x-forwarded-for']
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim()
  return first || req.socket?.remoteAddress || 'unknown'
}

/** Anzahl Versuche (optional nur fehlgeschlagene) im Zeitfenster. */
async function countAttempts(kind: AttemptKind, key: string, windowMinutes: number, onlyFailures: boolean) {
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString()
  let query = supaAdmin
    .from('auth_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('kind', kind)
    .eq('key_hash', hashKey(key))
    .gte('created_at', since)
  if (onlyFailures) query = query.eq('success', false)
  const { count, error } = await query
  if (error) {
    logError('rateLimit.count', error)
    return 0
  }
  return count ?? 0
}

export async function isLimited(
  kind: AttemptKind,
  keys: string[],
  { max, windowMinutes, onlyFailures }: { max: number; windowMinutes: number; onlyFailures: boolean },
): Promise<boolean> {
  const counts = await Promise.all(keys.map((k) => countAttempts(kind, k, windowMinutes, onlyFailures)))
  return counts.some((c) => c >= max)
}

export async function recordAttempt(kind: AttemptKind, keys: string[], success: boolean) {
  const rows = keys.map((k) => ({ kind, key_hash: hashKey(k), success }))
  const { error } = await supaAdmin.from('auth_attempts').insert(rows)
  if (error) logError('rateLimit.record', error)
}
