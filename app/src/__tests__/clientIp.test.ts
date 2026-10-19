/**
 * @jest-environment node
 */
import { clientIp } from '@/lib/rateLimit'

type Req = Parameters<typeof clientIp>[0]

const req = (xff?: string | string[], remote = '10.0.0.2') =>
  ({
    headers: xff === undefined ? {} : { 'x-forwarded-for': xff },
    socket: { remoteAddress: remote },
  }) as unknown as Req

describe('clientIp', () => {
  it('nimmt hinter einem Proxy den Eintrag, den der Proxy angehängt hat', () => {
    expect(clientIp(req('203.0.113.7'), 1)).toBe('203.0.113.7')
  })

  it('lässt sich nicht mit einem vorgetäuschten Header austricksen', () => {
    // Besucher schickt selbst "1.2.3.4", nginx hängt die echte Adresse an
    expect(clientIp(req('1.2.3.4, 203.0.113.7'), 1)).toBe('203.0.113.7')
    expect(clientIp(req(['1.2.3.4', '203.0.113.7']), 1)).toBe('203.0.113.7')
  })

  it('zählt mehrere eigene Proxys von hinten', () => {
    expect(clientIp(req('1.2.3.4, 203.0.113.7, 10.0.0.9'), 2)).toBe('203.0.113.7')
  })

  it('ohne Header oder ohne Proxy gilt die Verbindungsadresse', () => {
    expect(clientIp(req(), 1)).toBe('10.0.0.2')
    expect(clientIp(req('1.2.3.4'), 0)).toBe('10.0.0.2')
  })
})
