// src/lib/supabaseServer.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'crypto'

let cachedAdmin: SupabaseClient | null = null

/**
 * Address and service role key of Supabase. Read on first use: the Docker build in
 * CI has no environment variables, and reading them at module level would make
 * `next build` fail. Reads SUPABASE_URL as in prod.env; NEXT_PUBLIC_SUPABASE_URL
 * works as well.
 */
export function supabaseConfig(): { url: string; serviceKey: string } {
  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.replace(/\/+$/, '')
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }
  return { url, serviceKey }
}

export function getSupaAdmin(): SupabaseClient {
  if (cachedAdmin) return cachedAdmin
  const { url, serviceKey } = supabaseConfig()
  cachedAdmin = createClient(url, serviceKey, {
    auth: { persistSession: false },
  })
  return cachedAdmin
}

/** JWT_SECRET of Supabase's example .env; keys signed with it can be made by anyone */
const EXAMPLE_JWT_SECRET = 'your-super-secret-jwt-token-with-at-least-32-characters-long'

/**
 * Whether the service role key is signed with the example JWT_SECRET. Then Supabase
 * still runs with that secret: anyone can make a key and read the whole database,
 * and sessions are forgeable when SESSION_SECRET is derived from the key.
 */
export function serviceKeyFromExample(key = process.env.SUPABASE_SERVICE_ROLE_KEY): boolean {
  const [head, body, sig] = key?.split('.') ?? []
  if (!head || !body || !sig) return false
  const expected = createHmac('sha256', EXAMPLE_JWT_SECRET).update(`${head}.${body}`).digest()
  const given = Buffer.from(sig, 'base64url')
  return given.length === expected.length && timingSafeEqual(given, expected)
}
