/**
 * @jest-environment node
 */
import { clientIp, trustedProxies } from '@/lib/rateLimit'
import { registrationOpen } from '@/lib/features'

type Req = Parameters<typeof clientIp>[0]

const req = (xff?: string | string[], remote = '10.0.0.2') =>
  ({
    headers: xff === undefined ? {} : { 'x-forwarded-for': xff },
    socket: { remoteAddress: remote },
  }) as unknown as Req

describe('clientIp', () => {
  it('behind a proxy, takes the entry the proxy appended', () => {
    expect(clientIp(req('203.0.113.7'), 1)).toBe('203.0.113.7')
  })

  it('cannot be fooled by a spoofed header', () => {
    // The visitor sends "1.2.3.4" themselves, nginx appends the real address
    expect(clientIp(req('1.2.3.4, 203.0.113.7'), 1)).toBe('203.0.113.7')
    expect(clientIp(req(['1.2.3.4', '203.0.113.7']), 1)).toBe('203.0.113.7')
  })

  it('counts several own proxies from the end', () => {
    expect(clientIp(req('1.2.3.4, 203.0.113.7, 10.0.0.9'), 2)).toBe('203.0.113.7')
  })

  it('without header or without proxy, uses the socket address', () => {
    expect(clientIp(req(), 1)).toBe('10.0.0.2')
    expect(clientIp(req('1.2.3.4'), 0)).toBe('10.0.0.2')
  })
})

describe('switches from prod.env', () => {
  it('TRUSTED_PROXIES: empty or invalid means the default 1, not 0', () => {
    expect(trustedProxies(undefined)).toBe(1)
    expect(trustedProxies('')).toBe(1)
    expect(trustedProxies('  ')).toBe(1)
    expect(trustedProxies('abc')).toBe(1)
    expect(trustedProxies('-1')).toBe(1)
    expect(trustedProxies('0')).toBe(0)
    expect(trustedProxies('2')).toBe(2)
  })

  it('ALLOW_REGISTRATION: off unless switched on explicitly', () => {
    for (const on of ['true', 'TRUE', ' 1 ', 'yes', 'on']) expect(registrationOpen(on)).toBe(true)
    for (const off of [undefined, '', 'false', '0', 'no', 'maybe']) expect(registrationOpen(off)).toBe(false)
  })
})
