/**
 * @jest-environment node
 */

// A tiny stand-in for the Supabase client: answers for app_meta and users, records invites
const answers: { meta: { data: unknown; error: unknown }; users: number } = {
  meta: { data: null, error: null },
  users: 0,
}
const invites: Array<Record<string, unknown>> = []

jest.mock('@/lib/supabaseServer', () => ({
  getSupaAdmin: () => ({
    from: (table: string) => {
      if (table === 'app_meta') {
        const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => answers.meta }
        return chain
      }
      if (table === 'users') return { select: async () => ({ count: answers.users, error: null }) }
      if (table === 'invites') {
        return {
          insert: (row: Record<string, unknown>) => {
            invites.push(row)
            return { select: () => ({ single: async () => ({ data: { id: 'i1', ...row }, error: null }) }) }
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import { REQUIRED_SCHEMA, resetSchemaCache, schemaStatus } from '@/lib/schema'
import { onServerStart } from '@/lib/firstStart'
import { hashToken } from '@/lib/tokens'

const version = (value: string | null) => ({ data: value === null ? null : { value }, error: null })

beforeEach(() => {
  resetSchemaCache()
  invites.length = 0
  answers.users = 0
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('schemaStatus', () => {
  it('is current when the stored version is at least the required one', async () => {
    answers.meta = version(String(REQUIRED_SCHEMA))
    expect(await schemaStatus()).toEqual({ state: 'current', have: REQUIRED_SCHEMA, need: REQUIRED_SCHEMA })
    resetSchemaCache()
    answers.meta = version(String(REQUIRED_SCHEMA + 3))
    expect((await schemaStatus()).state).toBe('current')
  })

  it('treats a missing app_meta table or row as version 0', async () => {
    answers.meta = { data: null, error: { code: 'PGRST205', message: 'Could not find the table' } }
    expect(await schemaStatus()).toEqual({ state: 'outdated', have: 0, need: REQUIRED_SCHEMA })
    resetSchemaCache()
    answers.meta = version(null)
    expect((await schemaStatus()).have).toBe(0)
  })

  it('does not claim an outdated database when it cannot tell', async () => {
    answers.meta = { data: null, error: { code: 'ECONNREFUSED', message: 'fetch failed' } }
    expect((await schemaStatus()).state).toBe('unknown')
  })

  it('keeps a current result, but looks again after an outdated one', async () => {
    answers.meta = version('0')
    expect((await schemaStatus()).state).toBe('outdated')
    answers.meta = version(String(REQUIRED_SCHEMA))
    expect((await schemaStatus()).state).toBe('outdated') // cached for a short while
    const now = Date.now()
    jest.spyOn(Date, 'now').mockReturnValue(now + 31_000)
    expect((await schemaStatus()).state).toBe('current')
    answers.meta = version('0')
    expect((await schemaStatus()).state).toBe('current')
  })
})

describe('onServerStart', () => {
  it('writes a one-time admin link when nobody has an account', async () => {
    answers.meta = version(String(REQUIRED_SCHEMA))
    await onServerStart()
    expect(invites).toHaveLength(1)
    expect(invites[0]).toMatchObject({ make_admin: true, family_id: null, role: null, created_by: null, email: null })
    const logged = (console.log as jest.Mock).mock.calls.flat().join('\n')
    const token = /\/invite\/([A-Za-z0-9_-]{32,128})/.exec(logged)?.[1]
    expect(token && hashToken(token)).toBe(invites[0].token_hash)
  })

  it('stays quiet once accounts exist', async () => {
    answers.meta = version(String(REQUIRED_SCHEMA))
    answers.users = 2
    await onServerStart()
    expect(invites).toHaveLength(0)
    expect(console.log).not.toHaveBeenCalled()
  })

  it('asks for setup.sql instead of creating a link on an outdated database', async () => {
    answers.meta = version('0')
    await onServerStart()
    expect(invites).toHaveLength(0)
    expect((console.warn as jest.Mock).mock.calls.flat().join(' ')).toContain('supabase/setup.sql')
  })
})
