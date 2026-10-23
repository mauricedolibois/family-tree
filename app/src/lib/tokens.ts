// src/lib/tokens.ts
// One-time tokens for invitations, email verification and password resets.
// The database stores only the SHA-256 hash, so a leaked table cannot be turned
// back into working links.

import { createHash, randomBytes } from 'crypto'

/** 256 random bits, URL-safe */
export const newToken = () => randomBytes(32).toString('base64url')

export const hashToken = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex')

/** Tokens from links: our own (base64url) and those made by the SQL helper (hex) */
export const isTokenShaped = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(value)
