// src/lib/passwords.ts

import bcrypt from 'bcryptjs'
import { passwordProblem } from './passwordRules'

export const MAX_NAME_LENGTH = 80

/** A new password that follows the rules (passwordRules.ts); `personal`: the person's name and email */
export const validPassword = (pw: unknown, personal: Array<string | null | undefined> = []): pw is string =>
  typeof pw === 'string' && passwordProblem(pw, personal) === null

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
