// Rules for new passwords, shared by the forms and the server. Length matters most,
// and a password from the lists attackers try first is weak at any length, so the
// rules are: at least MIN_PASSWORD_LENGTH characters, at most what bcrypt reads, not
// one of the most used passwords or a common word with digits around it, and not
// the person's own name or address. Existing passwords keep working.

import type { Messages } from '@/i18n/messages'
import { COMMON_PASSWORDS, COMMON_WORDS } from './commonPasswords'

export const MIN_PASSWORD_LENGTH = 10
/** bcrypt only looks at the first 72 bytes; longer passwords would give a false sense of strength */
export const MAX_PASSWORD_BYTES = 72

export type PasswordProblem = 'short' | 'long' | 'common' | 'personal'

const common = new Set(COMMON_PASSWORDS)
const words = new Set(COMMON_WORDS)
const SEQUENCES = [
  '0123456789',
  'abcdefghijklmnopqrstuvwxyz',
  'qwertzuiopü',
  'qwertyuiop',
  'asdfghjkl',
  'yxcvbnm',
  'zxcvbnm',
]
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's' }

/** Lower case, look-alike digits as letters, without digits and symbols at either end */
function core(pw: string) {
  const plain = pw
    .toLowerCase()
    .replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '')
    .replace(/[013457@$]/g, (c) => LEET[c])
  return plain.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
}

/** The same characters over and over ("aaaaaaaaaa", "abcabcabcabc", "sommersommer") */
const repeats = (s: string) => /^(.+)\1+$/.test(s)

/** A run along the alphabet, the digits or a keyboard row, either way */
function sequence(s: string) {
  const backwards = [...s].reverse().join('')
  return SEQUENCES.some((row) => (row + row).includes(s) || (row + row).includes(backwards))
}

/** Parts of the person's name and email address that are long enough to matter */
function personalWords(personal: Array<string | null | undefined>) {
  return personal
    .flatMap((p) => (p ?? '').toLowerCase().split(/[\s@._+-]+/))
    .map(core)
    .filter((w) => w.length >= 4)
}

/** What is wrong with a new password, or null when it may be used */
export function passwordProblem(pw: string, personal: Array<string | null | undefined> = []): PasswordProblem | null {
  if ([...pw].length < MIN_PASSWORD_LENGTH) return 'short'
  if (new TextEncoder().encode(pw).length > MAX_PASSWORD_BYTES) return 'long'
  const lower = pw.toLowerCase()
  const base = core(pw)
  if (common.has(lower) || repeats(lower) || sequence(lower)) return 'common'
  if (!base || words.has(base) || repeats(base) || sequence(base)) return 'common'
  const own = personalWords(personal)
  if (own.some((w) => base === w || base.replace(/[^\p{L}]/gu, '') === w)) return 'personal'
  if (personal.some((p) => p && p.length >= 4 && lower.includes(p.toLowerCase()))) return 'personal'
  return null
}

/** The text for what is wrong with a new password, or null when it may be used */
export function passwordError(pw: string, personal: Array<string | null | undefined>, t: Messages): string | null {
  const problem = passwordProblem(pw, personal)
  if (!problem) return null
  return problem === 'short' ? t.auth.passwordProblem.short(MIN_PASSWORD_LENGTH) : t.auth.passwordProblem[problem]
}
