// src/lib/rateLimit.ts
//
// Throttles password guessing and mass sign-ups.
// Attempts are counted in `auth_attempts` (hashed keys only, no plain IPs).
// If the table is missing nothing is blocked, so nobody gets locked out;
// the error still ends up in the log.

import { createHmac } from 'crypto'
import type { IncomingMessage } from 'http'
import { getSupaAdmin } from '@/lib/supabaseServer'
import { logError } from '@/lib/log'

export type AttemptKind = 'login' | 'register'

function hashKey(value: string): string {
  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'family-tree'
  return createHmac('sha256', salt).update(value).digest('hex').slice(0, 32)
}

/** Number of own reverse proxies in front of the app (TRUSTED_PROXIES, default 1 = one nginx) */
export function trustedProxies(raw = process.env.TRUSTED_PROXIES): number {
  // Empty or invalid → default. Otherwise "" would become 0, every visitor would
  // get the proxy's address, and everyone would share a single login limit.
  if (!raw?.trim()) return 1
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 ? n : 1
}

/**
 * Visitor IP. Each proxy appends the address it received the request from to
 * X-Forwarded-For, so only the last entries can be trusted; the visitor can put
 * anything at the start of the list. Without a proxy (TRUSTED_PROXIES=0) only
 * the socket address counts.
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

/** Number of attempts (optionally failures only) within the window. */
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
