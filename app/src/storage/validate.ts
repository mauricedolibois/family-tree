// src/storage/validate.ts
//
// Checks a tree before the server stores it. Broken or tampered data is rejected
// instead of overwriting the real tree. Returns a clean copy with known fields only.

import type { MediaKind, StoredMedia, StoredMemberV3, StoredProfile, StoredTree } from './schema'

export const LIMITS = {
  members: 5000,
  name: 200,
  shortText: 200,
  comments: 20_000,
  mediaPerMember: 200,
  url: 2000,
} as const

const GENDERS = new Set(['MALE', 'FEMALE'])
const MEDIA_KINDS = new Set<MediaKind>(['image', 'video', 'pdf', 'other'])
/** Full date, month and year, or year only (old records are often vague) */
const ISO_DATE = /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/

export type ValidationResult = { ok: true; tree: StoredTree } | { ok: false; error: string }

class Invalid extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function str(v: unknown, field: string, max: number): string {
  if (typeof v !== 'string') throw new Invalid(`${field}: expected text`)
  if (v.length > max) throw new Invalid(`${field}: too long`)
  return v
}

function optStr(v: unknown, field: string, max: number): string | null {
  if (v === undefined || v === null || v === '') return null
  return str(v, field, max)
}

function optDate(v: unknown, field: string): string | null {
  const s = optStr(v, field, 10)
  if (s !== null && !ISO_DATE.test(s)) throw new Invalid(`${field}: expected a date as YYYY-MM-DD, YYYY-MM or YYYY`)
  return s
}

/** Yes/no; missing means no */
function optFlag(v: unknown, field: string): boolean {
  if (v === undefined || v === null) return false
  if (typeof v !== 'boolean') throw new Invalid(`${field}: expected true or false`)
  return v
}

function url(v: unknown, field: string): string {
  const s = str(v, field, LIMITS.url)
  if (!/^https?:\/\//i.test(s)) throw new Invalid(`${field}: invalid URL`)
  return s
}

/** Links to people who do not exist (any more) are dropped silently. */
function idList(v: unknown, field: string, ids: Set<string>): string[] {
  if (v === undefined || v === null) return []
  if (!Array.isArray(v)) throw new Invalid(`${field}: expected a list`)
  const out: string[] = []
  for (const id of v) {
    if (typeof id !== 'string') throw new Invalid(`${field}: ID als expected text`)
    if (ids.has(id) && !out.includes(id)) out.push(id)
  }
  return out
}

function media(v: unknown, field: string): StoredMedia[] {
  if (v === undefined || v === null) return []
  if (!Array.isArray(v)) throw new Invalid(`${field}: expected a list`)
  if (v.length > LIMITS.mediaPerMember) throw new Invalid(`${field}: too many files`)
  return v.map((m, i) => {
    if (!isObj(m)) throw new Invalid(`${field}[${i}]: expected an object`)
    const kind = m.kind as MediaKind
    if (!MEDIA_KINDS.has(kind)) throw new Invalid(`${field}[${i}].kind: unknown`)
    return {
      id: str(m.id, `${field}[${i}].id`, 100),
      url: url(m.url, `${field}[${i}].url`),
      kind,
      title: optStr(m.title, `${field}[${i}].title`, LIMITS.shortText),
      createdAt: optStr(m.createdAt, `${field}[${i}].createdAt`, 40),
    }
  })
}

function profile(v: unknown, field: string): StoredProfile {
  if (v === undefined || v === null) v = {}
  if (!isObj(v)) throw new Invalid(`${field}: expected an object`)
  const title = v.titleImageUrl
  return {
    birthDate: optDate(v.birthDate, `${field}.birthDate`),
    birthPlace: optStr(v.birthPlace, `${field}.birthPlace`, LIMITS.shortText),
    maidenName: optStr(v.maidenName, `${field}.maidenName`, LIMITS.shortText),
    deathDate: optDate(v.deathDate, `${field}.deathDate`),
    ...(optFlag(v.deceased, `${field}.deceased`) ? { deceased: true } : {}),
    country: optStr(v.country, `${field}.country`, LIMITS.shortText),
    city: optStr(v.city, `${field}.city`, LIMITS.shortText),
    job: optStr(v.job, `${field}.job`, LIMITS.shortText),
    comments: optStr(v.comments, `${field}.comments`, LIMITS.comments),
    titleImageUrl: title === undefined || title === null || title === '' ? null : url(title, `${field}.titleImageUrl`),
    media: media(v.media, `${field}.media`),
  }
}

export function validateStoredTree(input: unknown): ValidationResult {
  try {
    if (!isObj(input)) throw new Invalid('tree: expected an object')
    if (input.version !== 3) throw new Invalid('tree: expected version 3')
    if (!isObj(input.members)) throw new Invalid('members: expected an object')

    const entries = Object.entries(input.members)
    if (entries.length === 0) throw new Invalid('members: tree is empty')
    if (entries.length > LIMITS.members) throw new Invalid('members: too many people')
    const ids = new Set(entries.map(([key]) => key))

    const rootId = str(input.rootId, 'rootId', 100)
    if (!ids.has(rootId)) throw new Invalid('rootId: person missing')

    const members: Record<string, StoredMemberV3> = {}
    for (const [key, raw] of entries) {
      const f = `members.${key}`
      if (!isObj(raw)) throw new Invalid(`${f}: expected an object`)
      if (raw.id !== key) throw new Invalid(`${f}.id: does not match its key`)
      const gender = raw.gender
      if (typeof gender !== 'string' || !GENDERS.has(gender)) throw new Invalid(`${f}.gender: unknown`)
      const rawSpouse =
        raw.spouseId === undefined || raw.spouseId === null ? null : str(raw.spouseId, `${f}.spouseId`, 100)
      const spouseId = rawSpouse !== null && ids.has(rawSpouse) && rawSpouse !== key ? rawSpouse : null
      const childrenIds = idList(raw.childrenIds, `${f}.childrenIds`, ids)
      members[key] = {
        id: key,
        name: str(raw.name, `${f}.name`, LIMITS.name).trim() || 'Ohne Namen',
        gender: gender as StoredMemberV3['gender'],
        spouseId,
        parentIds: idList(raw.parentIds, `${f}.parentIds`, ids),
        childrenIds,
        adoptedChildrenIds: idList(raw.adoptedChildrenIds, `${f}.adoptedChildrenIds`, ids).filter((c) =>
          childrenIds.includes(c),
        ),
        profile: profile(raw.profile, `${f}.profile`),
      }
    }

    return { ok: true, tree: { version: 3, rootId, members } }
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: e.message }
    throw e
  }
}
