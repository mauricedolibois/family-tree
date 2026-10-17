// src/lib/session.ts
//
// Signierte Sitzung statt roher Familien-ID im Cookie.
//
// Vorher stand im Cookie nur die Familien-ID. Die ist aber kein Geheimnis
// (sie steckt z. B. in jeder Foto-URL), wer sie kannte, war eingeloggt.
// Jetzt enthält das Cookie die ID plus Ablaufdatum, signiert mit HMAC-SHA256.
// Ohne den Server-Schlüssel lässt sich kein gültiges Cookie bauen.

import { createHmac, timingSafeEqual } from 'crypto'
import type { IncomingMessage, ServerResponse } from 'http'
import { parse, serialize } from 'cookie'

export const SESSION_COOKIE = 'ft_session'
/** Altes, unsigniertes Cookie – wird nur noch gelöscht, nie mehr gelesen. */
const LEGACY_COOKIE = 'fid'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 90 // 90 Tage

type SessionPayload = { fid: string; exp: number }

/**
 * Schlüssel zum Signieren. Bevorzugt SESSION_SECRET; sonst wird er aus dem
 * Service-Role-Key abgeleitet, damit keine neue Umgebungsvariable nötig ist.
 */
function getSecret(): string {
  const explicit = process.env.SESSION_SECRET
  if (explicit && explicit.length >= 32) return explicit
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw new Error('SESSION_SECRET oder SUPABASE_SERVICE_ROLE_KEY fehlt')
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

/** Liefert die Familien-ID, wenn das Token echt und nicht abgelaufen ist. */
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

/** Familien-ID aus der Anfrage (API-Route oder getServerSideProps). */
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
