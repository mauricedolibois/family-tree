import { describeError } from '@/lib/log'

describe('describeError', () => {
  it('shows the message and Supabase fields', () => {
    const err = { message: 'relation "x" does not exist', code: '42P01', details: null, hint: 'Migration fehlt?' }
    expect(describeError(err)).toBe('relation "x" does not exist | code=42P01 | hint=Migration fehlt?')
  })

  it('still shows errors without a message', () => {
    expect(describeError({ code: 'PGRST205', status: 404 })).toBe('code=PGRST205 | status=404')
    expect(describeError({})).toBe('unknown error')
  })

  it('names special error classes', () => {
    expect(describeError(new TypeError('kaputt'))).toBe('TypeError: kaputt')
    expect(describeError(new Error('normal'))).toBe('normal')
  })

  it('handles plain text and circular objects', () => {
    expect(describeError('nur Text')).toBe('nur Text')
    const loop: Record<string, unknown> = {}
    loop.self = loop
    expect(describeError(loop)).toBe('unknown error')
  })
})
