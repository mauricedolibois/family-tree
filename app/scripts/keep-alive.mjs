/**
 * Keep-alive for free Supabase cloud projects.
 *
 * Creates a throwaway tree and deletes it again, so Supabase does not pause
 * the project after 7 days without activity. Not needed when self-hosting.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
})

const KEEP_ALIVE_NAME = '__keep_alive_test_family__'

async function main() {
  console.log(`🔄 keep-alive started ${new Date().toISOString()}`)

  try {
    // A leftover from an earlier run that failed halfway
    await supabase.from('trees').delete().eq('name', KEEP_ALIVE_NAME)

    const { data: tree, error } = await supabase
      .from('trees')
      .insert({
        name: KEEP_ALIVE_NAME,
        data: { version: 3, rootId: 'keep-alive', members: {} },
      })
      .select('id')
      .single()
    if (error) throw new Error(`creating the test tree failed: ${error.message}`)

    await new Promise((resolve) => setTimeout(resolve, 2000))

    const { error: deleteError } = await supabase.from('trees').delete().eq('id', tree.id)
    if (deleteError) throw new Error(`deleting the test tree failed: ${deleteError.message}`)

    console.log('✅ keep-alive done, database stays active')
  } catch (error) {
    console.error('❌ keep-alive failed:', error)
    process.exit(1)
  }
}

main()
