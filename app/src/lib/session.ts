// src/lib/session.ts
//
// Signed session cookie for a signed-in user: user id, session epoch and expiry,
// signed with HMAC-SHA256 so it cannot be forged without the server's key.
// Raising the user's epoch in the database ends every session issued before.
// Cookies of the former shared family login are only ever cleared, never read.

import { createHmac, timingSafeEqual } from 'crypto'
import type { IncomingMessage, ServerResponse } from 'http'
import { parseCookie, stringifySetCookie } from 'cookie'

export const SESSION_COOKIE = 'ft_user'
const LEGACY_COOKIES = ['ft_session', 'fid']
const MAX_AGE_SECONDS = 60 * 60 * 24 * 90 // 90 days

export type Session = { uid: string; epoch: number }
type SessionPayload = { uid: string; ep: number; exp: number }

/**
 * Signing key. Prefers SESSION_SECRET; otherwise derived from the service role
 * key so no extra environment variable is required. The context string differs
 * from the old family sessions, so their cookies can never pass as user sessions.
 */
function getSecret(): string {
  const explicit = process.env.SESSION_SECRET
  if (explicit && explicit.length >= 32) return createHmac('sha256', explicit).update('user-session').digest('hex')
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw new Error('SESSION_SECRET or SUPABASE_SERVICE_ROLE_KEY is missing')
  return createHmac('sha256', serviceKey).update('family-tree/session/v2').digest('hex')
}

function sign(data: string, secret = getSecret()): string {
  return createHmac('sha256', secret).update(data).digest('base64url')
}

export function createSessionToken(session: Session, now = Date.now()): string {
  const payload: SessionPayload = { uid: session.uid, ep: session.epoch, exp: Math.floor(now / 1000) + MAX_AGE_SECONDS }
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${data}.${sign(data)}`
}

/** The session if the token is genuine and not expired; the epoch is checked against the database later. */
export function verifySessionToken(token: string | undefined | null, now = Date.now()): Session | null {
  if (!token) return null
  const dot = token.indexOf('.')
  if (dot <= 0 || dot === token.length - 1) return null
  const data = token.slice(0, dot)
  const given = Buffer.from(token.slice(dot + 1))
  const expected = Buffer.from(sign(data))
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as SessionPayload
    if (typeof payload.uid !== 'string' || !payload.uid) return null
    if (!Number.isInteger(payload.ep)) return null
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < now) return null
    return { uid: payload.uid, epoch: payload.ep }
  } catch {
    return null
  }
}

/** Session from the request (API route or getServerSideProps) */
export function sessionFromReq(req: Pick<IncomingMessage, 'headers'>): Session | null {
  const header = req.headers.cookie
  if (!header) return null
  return verifySessionToken(parseCookie(header)[SESSION_COOKIE])
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

const clearLegacy = () => LEGACY_COOKIES.map((name) => stringifySetCookie({ name, value: '', ...cookieOptions(0) }))

export function setSessionCookie(res: ServerResponse, session: Session) {
  appendSetCookie(res, [
    stringifySetCookie({ name: SESSION_COOKIE, value: createSessionToken(session), ...cookieOptions(MAX_AGE_SECONDS) }),
    ...clearLegacy(),
  ])
}

export function clearSessionCookie(res: ServerResponse) {
  appendSetCookie(res, [stringifySetCookie({ name: SESSION_COOKIE, value: '', ...cookieOptions(0) }), ...clearLegacy()])
}
