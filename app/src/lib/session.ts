// src/lib/session.ts
//
// Signed session cookie instead of a raw family id.
//
// The family id is not a secret (it is part of every photo URL), so a cookie
// holding just the id let anyone in who knew it. The cookie now carries the id
// and an expiry, signed with HMAC-SHA256; it cannot be forged without the key.

import { createHmac, timingSafeEqual } from 'crypto'
import type { IncomingMessage, ServerResponse } from 'http'
import { parse, serialize } from 'cookie'

export const SESSION_COOKIE = 'ft_session'
/** Old unsigned cookie: only ever cleared, never read. */
const LEGACY_COOKIE = 'fid'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 90 // 90 days

type SessionPayload = { fid: string; exp: number }

/**
 * Signing key. Prefers SESSION_SECRET; otherwise derived from the service role
 * key so no extra environment variable is required.
 */
function getSecret(): string {
  const explicit = process.env.SESSION_SECRET
  if (explicit && explicit.length >= 32) return explicit
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw new Error('SESSION_SECRET or SUPABASE_SERVICE_ROLE_KEY is missing')
  return createHmac('sha256', serviceKey).update('family-tree/session/v1').digest('hex')
}

function sign(data: string, secret = getSecret()): string {
  return createHmac('sha256', secret).update(data).digest('base64url')
}

export function createSessionToken(fid: string, now = Date.now()): string {
  const payload: SessionPayload = { fid, exp: Math.floor(now / 1000) + MAX_AGE_SECONDS }
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${data}.${sign(data)}`
}

/** Returns the family id if the token is genuine and not expired. */
export function verifySessionToken(token: string | undefined | null, now = Date.now()): string | null {
  if (!token) return null
  const dot = token.indexOf('.')
  if (dot <= 0 || dot === token.length - 1) return null
  const data = token.slice(0, dot)
  const given = Buffer.from(token.slice(dot + 1))
  const expected = Buffer.from(sign(data))
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as SessionPayload
    if (typeof payload.fid !== 'string' || !payload.fid) return null
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < now) return null
    return payload.fid
  } catch {
    return null
  }
}

/** Family id from the request (API route or getServerSideProps). */
export function getFamilyIdFromReq(req: Pick<IncomingMessage, 'headers'>): string | null {
  const header = req.headers.cookie
  if (!header) return null
  return verifySessionToken(parse(header)[SESSION_COOKIE])
}

function cookieOptions(maxAge: number) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge,
  }
}

function appendSetCookie(res: ServerResponse, cookies: string[]) {
  const existing = res.getHeader('Set-Cookie')
  const prev = Array.isArray(existing) ? existing : existing ? [String(existing)] : []
  res.setHeader('Set-Cookie', [...prev, ...cookies])
}

export function setSessionCookie(res: ServerResponse, fid: string) {
  appendSetCookie(res, [
    serialize(SESSION_COOKIE, createSessionToken(fid), cookieOptions(MAX_AGE_SECONDS)),
    serialize(LEGACY_COOKIE, '', cookieOptions(0)),
  ])
}

export function clearSessionCookie(res: ServerResponse) {
  appendSetCookie(res, [
    serialize(SESSION_COOKIE, '', cookieOptions(0)),
    serialize(LEGACY_COOKIE, '', cookieOptions(0)),
  ])
}
