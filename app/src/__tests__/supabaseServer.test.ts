/**
 * @jest-environment node
 */
import { createHmac } from 'crypto'
import { serviceKeyFromExample } from '@/lib/supabaseServer'

// The service role key from Supabase's docker/.env.example (public)
const DEMO_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q'

function sign(secret: string) {
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const unsigned = `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ role: 'service_role', iss: 'supabase' })}`
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`
}

describe('serviceKeyFromExample', () => {
  it("recognises the example file's demo key", () => {
    expect(serviceKeyFromExample(DEMO_KEY)).toBe(true)
  })

  it('recognises any key signed with the example JWT_SECRET', () => {
    expect(serviceKeyFromExample(sign('your-super-secret-jwt-token-with-at-least-32-characters-long'))).toBe(true)
  })

  it('accepts keys signed with another secret', () => {
    expect(serviceKeyFromExample(sign('a-secret-of-this-installation-only-0123456789'))).toBe(false)
  })

  it('says nothing about missing or malformed keys', () => {
    expect(serviceKeyFromExample(undefined)).toBe(false)
    expect(serviceKeyFromExample('')).toBe(false)
    expect(serviceKeyFromExample('not-a-jwt')).toBe(false)
    expect(serviceKeyFromExample('a.b.')).toBe(false)
  })
})
