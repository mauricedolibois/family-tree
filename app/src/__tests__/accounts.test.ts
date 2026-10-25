/**
 * @jest-environment node
 */
import { createHash } from 'crypto'
import { cleanAdminPatch, inviteIsOpen, looksLikeEmail, normalizeEmail, parseRole } from '@/lib/accounts'
import { canEdit, canManage } from '@/lib/auth'
import { inviteDays, inviteEmail } from '@/lib/invites'
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

  it('passwords follow the rules for new passwords (passwordRules.test.ts)', () => {
    expect(validPassword('Kuchen am Sonntag')).toBe(true)
    expect(validPassword('kurz')).toBe(false)
    expect(validPassword('Sommer2024!')).toBe(false)
    expect(validPassword('Reiser1975!', ['Lars Reiser', 'lars@example.org'])).toBe(false)
    expect(validPassword(12345678901)).toBe(false)
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

  it('writes German first, then English, and escapes HTML', () => {
    const m = renderMail(
      { kind: 'invite', path: '/invite/t0k3n', name: '<b>Lars</b>', tree: 'Reiser' },
      'https://tree.example.org',
    )
    expect(m.subject).toBe(
      '<b>Lars</b> lädt dich zum Stammbaum „Reiser“ ein · <b>Lars</b> invites you to the family tree “Reiser”',
    )
    const de = m.text.indexOf('Einladung annehmen')
    const en = m.text.indexOf('Accept invitation')
    expect(de).toBeGreaterThan(-1)
    expect(en).toBeGreaterThan(de)
    expect(m.text.match(/https:\/\/tree\.example\.org\/invite\/t0k3n/g)).toHaveLength(2)
    expect(m.html.indexOf('lang="de"')).toBeLessThan(m.html.indexOf('lang="en"'))
    expect(m.html).toContain('&lt;b&gt;Lars&lt;/b&gt;')
    expect(m.html).not.toContain('<b>Lars</b>')
  })

  it('every kind of mail has both languages', () => {
    for (const kind of ['invite', 'verify', 'reset'] as const) {
      const m = renderMail({ kind, path: '/x', name: 'Ida', tree: '' }, 'https://a.example')
      expect(m.html).toContain('lang="de"')
      expect(m.html).toContain('lang="en"')
      expect(m.subject).toContain(' · ')
    }
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

describe('roles', () => {
  it('accepts only the three tree roles', () => {
    expect(['viewer', 'editor', 'moderator'].map(parseRole)).toEqual(['viewer', 'editor', 'moderator'])
    for (const bad of ['admin', 'owner', '', null, undefined, 1]) expect(parseRole(bad)).toBeNull()
  })

  it('moderators edit and manage, editors only edit, viewers neither', () => {
    // Admins have no role of their own in a tree: they get one by being a member
    const table = (['moderator', 'editor', 'viewer', null] as const).map((a) => [a, canEdit(a), canManage(a)])
    expect(table).toEqual([
      ['moderator', true, true],
      ['editor', true, false],
      ['viewer', false, false],
      [null, false, false],
    ])
  })
})

describe('invitation input', () => {
  it('address is optional but must look valid when given', () => {
    expect(inviteEmail('')).toBeNull()
    expect(inviteEmail('  ')).toBeNull()
    expect(inviteEmail(undefined)).toBeNull()
    expect(inviteEmail(' oma@example.org ')).toBe('oma@example.org')
    expect(inviteEmail('not-an-address')).toBeUndefined()
  })

  it('validity is 1 to 30 days, 7 by default', () => {
    expect([undefined, 'x', 0, -5, 3.6, 30, 400].map(inviteDays)).toEqual([7, 7, 7, 1, 4, 30, 30])
  })

  it('null means no expiry', () => {
    expect(inviteDays(null)).toBeNull()
  })
})
