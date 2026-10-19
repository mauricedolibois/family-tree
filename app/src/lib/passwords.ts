// src/lib/passwords.ts

import bcrypt from 'bcryptjs'

export const MIN_PASSWORD_LENGTH = 8
/** bcrypt only looks at the first 72 bytes; longer passwords would give a false sense of strength */
export const MAX_PASSWORD_BYTES = 72
export const MAX_NAME_LENGTH = 80

export const validPassword = (pw: unknown): pw is string =>
  typeof pw === 'string' && pw.length >= MIN_PASSWORD_LENGTH && Buffer.byteLength(pw, 'utf8') <= MAX_PASSWORD_BYTES

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12)

/** Same work for unknown accounts, so response times do not reveal which addresses exist */
const DUMMY_HASH = '$2b$12$nRUAP04.3TGnyujKHqtRnuXxUGOpJWj4Vu9rMbXqeymloeArp18gW'

export const checkPassword = (pw: string, hash: string | null | undefined) => bcrypt.compare(pw, hash ?? DUMMY_HASH)

/** Trimmed display name within limits, or null */
export function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.trim().replace(/\s+/g, ' ')
  return name.length >= 1 && name.length <= MAX_NAME_LENGTH ? name : null
}
