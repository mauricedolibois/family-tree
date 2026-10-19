/**
 * @jest-environment node
 */
import { createHash } from 'crypto'
import { cleanAdminPatch, inviteIsOpen, looksLikeEmail, normalizeEmail } from '@/lib/accounts'
import { hashToken, isTokenShaped, newToken } from '@/lib/tokens'
import { safeNext } from '@/lib/pageAuth'
import { cleanName, validPassword } from '@/lib/passwords'
import { renderMail } from '@/lib/mail'
import { appUrl, emailVerificationRequired, flag } from '@/lib/features'

describe('tokens', () => {
  it('are long, URL-safe and unique', () => {
    const a = newToken()
    expect(isTokenShaped(a)).toBe(true)
    expect(a).not.toBe(newToken())
  })

  it('hash like the SQL helper does (hex SHA-256 of the UTF-8 text)', () => {
    expect(hashToken('abc')).toBe(createHash('sha256').update('abc').digest('hex'))
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('reject anything that does not look like a token', () => {
    for (const bad of ['', 'short', 'x'.repeat(200), '../../etc/passwd'.padEnd(40, 'a'), 42, null]) {
      expect(isTokenShaped(bad)).toBe(false)
    }
    expect(isTokenShaped('0123456789abcdef'.repeat(4))).toBe(true)
  })
})

describe('account input', () => {
  it('normalises and checks email addresses', () => {
    expect(normalizeEmail('  Lars.Reiser@Example.ORG ')).toBe('lars.reiser@example.org')
    expect(looksLikeEmail('max_m@example.org')).toBe(true)
    for (const bad of ['', 'no-at', 'a@b', 'two@@example.org', 'sp ace@example.org'])
      expect(looksLikeEmail(bad)).toBe(false)
  })

  it('passwords: at least 8 characters, at most 72 bytes', () => {
    expect(validPassword('1234567')).toBe(false)
    expect(validPassword('12345678')).toBe(true)
    expect(validPassword('ä'.repeat(36))).toBe(true)
    expect(validPassword('ä'.repeat(37))).toBe(false)
    expect(validPassword(12345678)).toBe(false)
  })

  it('names are trimmed and limited', () => {
    expect(cleanName('  Anna   Maria  ')).toBe('Anna Maria')
    expect(cleanName('   ')).toBeNull()
    expect(cleanName('x'.repeat(81))).toBeNull()
  })

  it('admin changes accept only known fields with the right types', () => {
    expect(cleanAdminPatch({ isAdmin: true })).toEqual({ is_admin: true })
    expect(cleanAdminPatch({ disabled: false })).toEqual({ disabled_at: null })
    expect(cleanAdminPatch({ disabled: true })?.disabled_at).toEqual(expect.any(String))
    expect(cleanAdminPatch({ isAdmin: 'yes' })).toBeNull()
    expect(cleanAdminPatch({})).toBeNull()
  })

  it('invites are open until used, revoked or expired', () => {
    const base = { used_at: null, revoked_at: null, expires_at: new Date(Date.now() + 60_000).toISOString() }
    expect(inviteIsOpen(base)).toBe(true)
    expect(inviteIsOpen({ ...base, used_at: new Date().toISOString() })).toBe(false)
    expect(inviteIsOpen({ ...base, revoked_at: new Date().toISOString() })).toBe(false)
    expect(inviteIsOpen({ ...base, expires_at: new Date(Date.now() - 1).toISOString() })).toBe(false)
  })
})

describe('redirect after sign-in', () => {
  it('only allows paths on this site', () => {
    expect(safeNext('/invite/abc')).toBe('/invite/abc')
    expect(safeNext('/tree/1?x=2')).toBe('/tree/1?x=2')
    for (const bad of ['//evil.example', 'https://evil.example', '/\\evil.example', 'javascript:alert(1)', '', null]) {
      expect(safeNext(bad)).toBeNull()
    }
  })
})

describe('mail', () => {
  afterEach(() => {
    delete process.env.APP_URL
    delete process.env.MAIL_ENABLED
    delete process.env.REQUIRE_EMAIL_VERIFICATION
  })

  it('renders in the recipient language and escapes HTML', () => {
    const m = renderMail(
      { kind: 'invite', locale: 'fr', path: '/invite/t0k3n', name: '<b>Lars</b>', tree: 'Reiser' },
      'https://tree.example.org',
    )
    expect(m.subject).toBe('<b>Lars</b> t’invite dans l’arbre « Reiser »')
    expect(m.text).toContain('https://tree.example.org/invite/t0k3n')
    expect(m.html).toContain('&lt;b&gt;Lars&lt;/b&gt;')
    expect(m.html).not.toContain('<b>Lars</b>')
  })

  it('falls back to German for unknown languages', () => {
    expect(
      renderMail({ kind: 'reset', locale: 'xx', path: '/reset/x', name: 'Ida' }, 'https://a.example').subject,
    ).toBe('Neues Passwort für den Stammbaum')
  })

  it('links only point to the configured APP_URL', () => {
    expect(appUrl()).toBeNull()
    process.env.APP_URL = 'https://tree.example.org/'
    expect(appUrl()).toBe('https://tree.example.org')
    process.env.APP_URL = 'javascript:alert(1)'
    expect(appUrl()).toBeNull()
  })

  it('verification is only required with mail switched on', () => {
    process.env.REQUIRE_EMAIL_VERIFICATION = 'true'
    expect(emailVerificationRequired()).toBe(false)
    process.env.MAIL_ENABLED = 'true'
    expect(emailVerificationRequired()).toBe(true)
    expect(flag('On')).toBe(true)
  })
})
