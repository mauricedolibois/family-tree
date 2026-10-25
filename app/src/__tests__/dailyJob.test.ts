/**
 * @jest-environment node
 */

const status = { state: 'current' as string }
jest.mock('@/lib/schema', () => ({ schemaStatus: async () => status }))
const from = jest.fn()
jest.mock('@/lib/supabaseServer', () => ({ getSupaAdmin: () => ({ from }) }))

import { collectPaths, fingerprint, msUntilNext, runDailyJob } from '@/lib/dailyJob'

const HOUR = 3_600_000
const at = (iso: string) => Date.parse(iso)

describe('msUntilNext', () => {
  it('waits until 03:00 UTC on the same day', () => {
    expect(msUntilNext(at('2026-10-24T01:30:00Z'))).toBe(1.5 * HOUR)
  })

  it('waits until the next day once 03:00 has passed', () => {
    expect(msUntilNext(at('2026-10-24T03:00:01Z'))).toBe(24 * HOUR - 1000)
    expect(msUntilNext(at('2026-10-24T23:00:00Z'))).toBe(4 * HOUR)
  })

  it('waits a whole day exactly at 03:00', () => {
    expect(msUntilNext(at('2026-10-24T03:00:00Z'))).toBe(24 * HOUR)
  })
})

describe('fingerprint', () => {
  it('ignores the order of keys', () => {
    expect(fingerprint({ a: 1, b: { c: [1, 2], d: null } })).toBe(fingerprint({ b: { d: null, c: [1, 2] }, a: 1 }))
  })

  it('sees changed values and array order', () => {
    expect(fingerprint({ a: [1, 2] })).not.toBe(fingerprint({ a: [2, 1] }))
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }))
  })
})

describe('collectPaths', () => {
  it('collects title images and media of every member, decoded and without query', () => {
    const paths = new Set<string>()
    collectPaths(
      {
        members: {
          a: {
            id: 'a',
            profile: {
              titleImageUrl: '/api/media/t1/a%20b.jpg?v=2',
              media: [{ url: '/api/media/t1/doc.pdf' }, { url: 'https://example.org/x.jpg' }],
            },
          },
          b: { id: 'b' },
        },
      } as never,
      paths,
    )
    expect([...paths].sort()).toEqual(['t1/a b.jpg', 't1/doc.pdf'])
  })

  it('accepts a missing tree', () => {
    const paths = new Set<string>()
    collectPaths(null, paths)
    expect(paths.size).toBe(0)
  })
})

describe('runDailyJob', () => {
  it('does nothing while the database is not at the needed version', async () => {
    status.state = 'outdated'
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    await runDailyJob()
    expect(from).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[daily] skipped'))
    warn.mockRestore()
  })

  it('logs errors instead of throwing them', async () => {
    status.state = 'current'
    from.mockImplementation(() => {
      throw new Error('connection refused')
    })
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})
    await expect(runDailyJob()).resolves.toBeUndefined()
    expect(error).toHaveBeenCalledWith('[daily] connection refused')
    error.mockRestore()
  })
})
