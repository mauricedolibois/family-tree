// src/lib/supabaseServer.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cachedAdmin: SupabaseClient | null = null

/**
 * Erst beim ersten Aufruf anlegen: Beim Docker-Build (CI) gibt es keine
 * Umgebungsvariablen, ein Client auf Modulebene würde `next build` abbrechen.
 * SUPABASE_URL wie im bestehenden prod.env; NEXT_PUBLIC_SUPABASE_URL geht auch.
 */
export function getSupaAdmin(): SupabaseClient {
  if (cachedAdmin) return cachedAdmin

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  cachedAdmin = createClient(url, serviceKey, {
    auth: { persistSession: false },
  })
  return cachedAdmin
}
