// src/lib/accounts.ts
import { abs, ensureDir, readJSON, writeJSON } from './fs'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { serialize, parse } from 'cookie' // <-- WICHTIG: named imports!
import path from 'path'
import fs from 'fs'
import type { NextApiRequest, NextApiResponse } from 'next'

type Account = { id: string; name: string; passwordHash: string; createdAt: string }
type AccountsFile = { accounts: Record<string, Account> } // key: lowercased name

const ACC_FILE = abs('data', 'accounts.json')

export async function loadAccounts(): Promise<AccountsFile> {
  await ensureDir(path.dirname(ACC_FILE))
  return readJSON<AccountsFile>(ACC_FILE, { accounts: {} })
}

export async function saveAccounts(db: AccountsFile) {
  await writeJSON(ACC_FILE, db)
}

function toKey(name: string) {
  return name.trim().toLowerCase()
}

export async function registerFamily(name: string, password: string) {
  const db = await loadAccounts()
  const key = toKey(name)
  if (db.accounts[key]) throw new Error('Name bereits vergeben')
  const id = randomBytes(8).toString('hex')
  const passwordHash = await bcrypt.hash(password, 10)
  const acc: Account = { id, name: name.trim(), passwordHash, createdAt: new Date().toISOString() }
  db.accounts[key] = acc
  await saveAccounts(db)
  return acc
}

export async function loginFamily(name: string, password: string) {
  const db = await loadAccounts()
  const key = toKey(name)
  const acc = db.accounts[key]
  if (!acc) throw new Error('Unbekannter Name')
  const ok = await bcrypt.compare(password, acc.passwordHash)
  if (!ok) throw new Error('Falsches Passwort')
  return acc
}

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

export function getFamilyIdFromReq(req: NextApiRequest): string | null {
  const header = req.headers.cookie
  if (!header) return null
  const c = parse(header)
  return c.fid ?? null
}

export function familyDataPath(fid: string) {
  return abs('data', 'families', `${fid}.json`)
}

export function familyUploadDir(fid: string) {
  const dir = abs('public', 'uploads', fid)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

// src/lib/accounts.ts
export async function getFamilyNameById(fid: string): Promise<string | null> {
  const db = await loadAccounts()
  const acc = Object.values(db.accounts).find((a) => a.id === fid)
  return acc ? acc.name : null
}

