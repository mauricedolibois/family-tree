// src/lib/accounts.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import bcrypt from 'bcryptjs'
import { serialize, parse } from 'cookie'
import { supaAdmin } from '@/lib/supabaseServer'

/**
 * DB-Schema (Supabase):
 *  families(id uuid pk, name text unique, pass_hash text, created_at timestamptz)
 */
export type Account = {
  id: string
  name: string
  pass_hash: string
  created_at: string
}

/** Rückwärtskompatibilität zum alten FS-Format (wird intern aus Supabase gebaut). */
type AccountsFile = {
  accounts: Record<string, { id: string; name: string; passwordHash: string; createdAt: string }>
}

function toKey(name: string) {
  return name.trim().toLowerCase()
}

/* ================================
 *   Supabase-basierte Funktionen
 * ================================ */

/**
 * Lade alle Accounts (nur für Dev/Kompatibilität).
 * Baut ein Objekt im alten FS-Format auf.
 */
export async function loadAccounts(): Promise<AccountsFile> {
  const { data, error } = await supaAdmin
    .from('families')
    .select('id,name,pass_hash,created_at')
  if (error) throw error

  const out: AccountsFile = { accounts: {} }
  for (const row of (data ?? []) as Account[]) {
    out.accounts[toKey(row.name)] = {
      id: row.id,
      name: row.name,
      passwordHash: row.pass_hash,
      createdAt: row.created_at,
    }
  }
  return out
}

/**
 * Platzhalter für alte FS-API. In der Supabase-Variante nicht benötigt.
 * Wird absichtlich leer gelassen, um Kompatibilität der Imports zu erhalten.
 */
export async function saveAccounts(_db: AccountsFile) {
  // no-op
}

/**
 * Familie registrieren (Familienname + Passwort).
 * Wirft Fehler, wenn der Name bereits belegt ist.
 */
export async function registerFamily(name: string, password: string) {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Name erforderlich')
  if (!password) throw new Error('Passwort erforderlich')

  // Existenz prüfen
  const { data: exists, error: exErr } = await supaAdmin
    .from('families')
    .select('id')
    .eq('name', trimmed)
    .maybeSingle()
  if (exErr) throw exErr
  if (exists) throw new Error('Name bereits vergeben')

  const pass_hash = await bcrypt.hash(password, 10)
  const { data, error } = await supaAdmin
    .from('families')
    .insert({ name: trimmed, pass_hash })
    .select('id,name,pass_hash,created_at')
    .single()
  if (error) throw error

  // Rückgabe im alten Account-Shape (passwordHash statt pass_hash)
  return {
    id: data.id,
    name: data.name,
    passwordHash: data.pass_hash,
    createdAt: data.created_at,
  }
}

/**
 * Familie einloggen (Familienname + Passwort).
 * Liefert Account im alten Shape zurück (passwordHash statt pass_hash).
 */
export async function loginFamily(name: string, password: string) {
  const trimmed = name.trim()
  const { data, error } = await supaAdmin
    .from('families')
    .select('id,name,pass_hash,created_at')
    .eq('name', trimmed)
    .single()

  if (error || !data) throw new Error('Unbekannter Name')
  const ok = await bcrypt.compare(password, (data as Account).pass_hash)
  if (!ok) throw new Error('Falsches Passwort')

  return {
    id: data.id,
    name: data.name,
    passwordHash: data.pass_hash,
    createdAt: data.created_at,
  }
}

/** Login-Cookie setzen (fid = family id) */
export function setFamilyCookie(res: NextApiResponse, id: string) {
  const cookieStr = serialize('fid', id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 Jahr
  })
  const existing = res.getHeader('Set-Cookie')
  const cookies = Array.isArray(existing)
    ? [...existing, cookieStr]
    : existing
    ? [String(existing), cookieStr]
    : [cookieStr]
  res.setHeader('Set-Cookie', cookies)
}

/** Login-Cookie löschen */
export function clearFamilyCookie(res: NextApiResponse) {
  const cookieStr = serialize('fid', '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
  const existing = res.getHeader('Set-Cookie')
  const cookies = Array.isArray(existing)
    ? [...existing, cookieStr]
    : existing
    ? [String(existing), cookieStr]
    : [cookieStr]
  res.setHeader('Set-Cookie', cookies)
}

/** Family-ID aus Request-Cookie lesen */
export function getFamilyIdFromReq(req: NextApiRequest): string | null {
  const header = req.headers.cookie
  if (!header) return null
  const c = parse(header)
  return (c as any).fid ?? null
}

/**
 * Kompatible Platzhalter-Funktionen (Dateipfade) für legacy Code.
 * In der Supabase-Variante gibt es keine echten Files – wir liefern
 * nur symbolische Pfade zurück, damit Logging o.ä. nicht crasht.
 */
export function familyDataPath(fid: string) {
  return `/supabase/families/${fid}.json`
}
export function familyUploadDir(fid: string) {
  return `/supabase/uploads/${fid}`
}

/** Familiennamen per ID laden (z. B. für Titelanzeige) */
export async function getFamilyNameById(fid: string): Promise<string | null> {
  const { data, error } = await supaAdmin
    .from('families')
    .select('name')
    .eq('id', fid)
    .single()
  if (error) return null
  return data?.name ?? null
}
