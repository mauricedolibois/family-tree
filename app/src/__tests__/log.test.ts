import { describeError } from '@/lib/log'

describe('describeError', () => {
  it('zeigt Meldung und Supabase-Felder', () => {
    const err = { message: 'relation "x" does not exist', code: '42P01', details: null, hint: 'Migration fehlt?' }
    expect(describeError(err)).toBe('relation "x" does not exist | code=42P01 | hint=Migration fehlt?')
  })

  it('zeigt Fehler ohne Meldung trotzdem an', () => {
    expect(describeError({ code: 'PGRST205', status: 404 })).toBe('code=PGRST205 | status=404')
    expect(describeError({})).toBe('unbekannter Fehler')
  })

  it('nennt besondere Fehlerklassen beim Namen', () => {
    expect(describeError(new TypeError('kaputt'))).toBe('TypeError: kaputt')
    expect(describeError(new Error('normal'))).toBe('normal')
  })

  it('kommt mit Text und zirkulären Objekten zurecht', () => {
    expect(describeError('nur Text')).toBe('nur Text')
    const loop: Record<string, unknown> = {}
    loop.self = loop
    expect(describeError(loop)).toBe('unbekannter Fehler')
  })
})
