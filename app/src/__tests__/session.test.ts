/**
 * @jest-environment node
 */
import { createSessionToken, getFamilyIdFromReq, SESSION_COOKIE, verifySessionToken } from '@/lib/session'

beforeAll(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
  delete process.env.SESSION_SECRET
})

describe('Sitzungs-Token', () => {
  it('liefert die Familien-ID für ein echtes Token', () => {
    const token = createSessionToken('fam-1')
    expect(verifySessionToken(token)).toBe('fam-1')
  })

  it('lehnt eine nackte Familien-ID ab (altes Cookie-Format)', () => {
    expect(verifySessionToken('8ebd1558-3085-4662-ba6b-dd67ff52d796')).toBeNull()
  })

  it('lehnt manipulierte Token ab', () => {
    const token = createSessionToken('fam-1')
    const [data, sig] = token.split('.')
    const forged = Buffer.from(JSON.stringify({ fid: 'fam-2', exp: 9999999999 })).toString('base64url')
    expect(verifySessionToken(`${forged}.${sig}`)).toBeNull()
    expect(verifySessionToken(`${data}.${sig.slice(0, -2)}xx`)).toBeNull()
  })

  it('lehnt abgelaufene Token ab', () => {
    const longAgo = Date.now() - 1000 * 60 * 60 * 24 * 365
    expect(verifySessionToken(createSessionToken('fam-1', longAgo))).toBeNull()
  })

  it('lehnt Token ab, die mit einem anderen Schlüssel signiert wurden', () => {
    const token = createSessionToken('fam-1')
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'anderer-schluessel'
    expect(verifySessionToken(token)).toBeNull()
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
  })

  it('liest das Token aus dem Cookie-Header, ignoriert das alte fid-Cookie', () => {
    const token = createSessionToken('fam-1')
    expect(getFamilyIdFromReq({ headers: { cookie: `${SESSION_COOKIE}=${token}` } })).toBe('fam-1')
    expect(getFamilyIdFromReq({ headers: { cookie: 'fid=fam-1' } })).toBeNull()
    expect(getFamilyIdFromReq({ headers: {} })).toBeNull()
  })
})
