// src/lib/supabaseServer.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

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
