/**
 * @jest-environment node
 */
import { createHmac } from 'crypto'
import { createSessionToken, sessionFromReq, SESSION_COOKIE, verifySessionToken } from '@/lib/session'

beforeAll(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
  delete process.env.SESSION_SECRET
})

const session = { uid: 'user-1', epoch: 2 }

describe('session token', () => {
  it('returns user id and epoch for a genuine token', () => {
    expect(verifySessionToken(createSessionToken(session))).toEqual(session)
  })

  it('rejects a bare id and the old family cookie format', () => {
    expect(verifySessionToken('8ebd1558-3085-4662-ba6b-dd67ff52d796')).toBeNull()
    // A family session signed the old way must not pass as a user session
    const oldKey = createHmac('sha256', 'test-service-key').update('family-tree/session/v1').digest('hex')
    const data = Buffer.from(JSON.stringify({ fid: 'fam-1', exp: 9999999999 })).toString('base64url')
    const sig = createHmac('sha256', oldKey).update(data).digest('base64url')
    expect(verifySessionToken(`${data}.${sig}`)).toBeNull()
  })

  it('rejects tampered tokens', () => {
    const token = createSessionToken(session)
    const [data, sig] = token.split('.')
    const forged = Buffer.from(JSON.stringify({ uid: 'admin', ep: 0, exp: 9999999999 })).toString('base64url')
    expect(verifySessionToken(`${forged}.${sig}`)).toBeNull()
    expect(verifySessionToken(`${data}.${sig.slice(0, -2)}xx`)).toBeNull()
  })

  it('rejects expired tokens', () => {
    const longAgo = Date.now() - 1000 * 60 * 60 * 24 * 365
    expect(verifySessionToken(createSessionToken(session, longAgo))).toBeNull()
  })

  it('rejects tokens signed with a different key', () => {
    const token = createSessionToken(session)
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'another-key'
    expect(verifySessionToken(token)).toBeNull()
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
  })

  it('reads the token from the cookie header and ignores old cookies', () => {
    const token = createSessionToken(session)
    expect(sessionFromReq({ headers: { cookie: `${SESSION_COOKIE}=${token}` } })).toEqual(session)
    expect(sessionFromReq({ headers: { cookie: 'fid=fam-1; ft_session=abc.def' } })).toBeNull()
    expect(sessionFromReq({ headers: {} })).toBeNull()
  })
})
