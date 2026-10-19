// src/lib/rateLimit.ts
//
// Bremse gegen Passwort-Raten und Massen-Registrierungen.
// Versuche werden in der Tabelle `auth_attempts` gezählt (nur gehashte
// Schlüssel, keine Klartext-IPs). Fehlt die Tabelle, wird nicht blockiert,
// damit niemand ausgesperrt wird – der Fehler landet aber im Log.

import { createHmac } from 'crypto'
import type { IncomingMessage } from 'http'
import { getSupaAdmin } from '@/lib/supabaseServer'
import { logError } from '@/lib/log'

export type AttemptKind = 'login' | 'register'

function hashKey(value: string): string {
  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'family-tree'
  return createHmac('sha256', salt).update(value).digest('hex').slice(0, 32)
}

/** Anzahl eigener Reverse-Proxys vor der App (TRUSTED_PROXIES, Standard 1 = ein nginx) */
export function trustedProxies(raw = process.env.TRUSTED_PROXIES): number {
  // Leer oder ungültig → Standard. Sonst würde aus "" die 0, und alle Besucher
  // hätten die Adresse des Proxys – eine einzige gemeinsame Login-Bremse für alle.
  if (!raw?.trim()) return 1
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 ? n : 1
}

/**
 * IP des Besuchers. Jeder Proxy hängt die Adresse, von der er die Anfrage bekam,
 * hinten an X-Forwarded-For an – verlässlich sind also nur die letzten Einträge.
 * Den Anfang der Liste kann der Besucher selbst beliebig füllen.
 * Ohne Proxy (TRUSTED_PROXIES=0) zählt nur die Verbindungsadresse.
 */
export function clientIp(req: Pick<IncomingMessage, 'headers' | 'socket'>, proxies = trustedProxies()): string {
  const direct = req.socket?.remoteAddress || 'unknown'
  if (proxies === 0) return direct
  const header = req.headers['x-forwarded-for']
  const hops = (Array.isArray(header) ? header.join(',') : header ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return hops.length ? hops[Math.max(0, hops.length - proxies)] : direct
}

/** Anzahl Versuche (optional nur fehlgeschlagene) im Zeitfenster. */
async function countAttempts(kind: AttemptKind, key: string, windowMinutes: number, onlyFailures: boolean) {
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString()
  let query = getSupaAdmin()
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
  const { error } = await getSupaAdmin().from('auth_attempts').insert(rows)
  if (error) logError('rateLimit.record', error)
}
