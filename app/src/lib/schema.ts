// Does the database match this app version? supabase/setup.sql stores its version
// in app_meta; the app only reads it and tells admins when the file has to be run
// (again). Nothing here changes the database structure.

import { getSupaAdmin } from './supabaseServer'
import { logError } from './log'

/** Raise together with the version at the end of supabase/setup.sql */
export const REQUIRED_SCHEMA = 1

export type SchemaStatus =
  | { state: 'current'; have: number; need: number }
  | { state: 'outdated'; have: number; need: number }
  // Database not reachable or misconfigured: other errors will say more
  | { state: 'unknown'; have: null; need: number }

/** PostgREST answers for a table that does not exist (v12+ and older versions) */
const MISSING_TABLE = new Set(['PGRST205', '42P01'])
const RECHECK_MS = 30_000

// A current database stays current until the app is replaced; anything else is
// checked again shortly, so the warning goes away once setup.sql has run.
let current: SchemaStatus | null = null
let lastCheck: { at: number; status: SchemaStatus } | null = null

export async function schemaStatus(): Promise<SchemaStatus> {
  if (current) return current
  if (lastCheck && Date.now() - lastCheck.at < RECHECK_MS) return lastCheck.status
  const status = await readStatus()
  if (status.state === 'current') current = status
  else lastCheck = { at: Date.now(), status }
  return status
}

async function readStatus(): Promise<SchemaStatus> {
  const need = REQUIRED_SCHEMA
  try {
    const { data, error } = await getSupaAdmin()
      .from('app_meta')
      .select('value')
      .eq('key', 'schema_version')
      .maybeSingle()
    if (error) {
      if (MISSING_TABLE.has(error.code)) return { state: 'outdated', have: 0, need }
      throw error
    }
    const have = Number.parseInt(data?.value ?? '0', 10) || 0
    return have >= need ? { state: 'current', have, need } : { state: 'outdated', have, need }
  } catch (err) {
    logError('schema', err)
    return { state: 'unknown', have: null, need }
  }
}

/** For tests */
export function resetSchemaCache() {
  current = null
  lastCheck = null
}
