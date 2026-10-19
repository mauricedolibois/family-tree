/**
 * Keep-alive for free Supabase cloud projects.
 *
 * Creates a throwaway family and deletes it again, so Supabase does not pause
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

const KEEP_ALIVE_FAMILY_NAME = '__keep_alive_test_family__'

async function main() {
  console.log('🔄 keep-alive started')
  console.log(`📅 ${new Date().toISOString()}`)

  try {
    // 1. Remove a leftover test family from an earlier run
    console.log('🔍 checking for a leftover test family')
    const { data: existingFamily } = await supabase
      .from('families')
      .select('id')
      .eq('name', KEEP_ALIVE_FAMILY_NAME)
      .single()

    if (existingFamily) {
      console.log('🗑️ deleting leftover test family')

      // Tree first, then the family
      await supabase.from('family_trees').delete().eq('family_id', existingFamily.id)

      await supabase.from('families').delete().eq('id', existingFamily.id)
    }

    // 2. Create a test family
    console.log('➕ creating test family')
    const { data: newFamily, error: createError } = await supabase
      .from('families')
      .insert({
        name: KEEP_ALIVE_FAMILY_NAME,
        pass_hash: 'keep_alive_dummy_hash',
      })
      .select()
      .single()

    if (createError) {
      throw new Error(`creating the family failed: ${createError.message}`)
    }

    console.log(`✅ test family created: ${newFamily.id}`)

    // 3. Create a test tree
    console.log('🌳 creating test tree')
    const testTree = {
      version: 3,
      rootId: 'keep-alive-root',
      members: {
        'keep-alive-root': {
          id: 'keep-alive-root',
          name: 'Keep Alive Test',
          gender: 'male',
          childrenIds: [],
          profile: {
            comments: `Created automatically at ${new Date().toISOString()}`,
          },
        },
      },
    }

    const { error: treeError } = await supabase.from('family_trees').insert({
      family_id: newFamily.id,
      tree_json: testTree,
      updated_at: new Date().toISOString(),
    })

    if (treeError) {
      throw new Error(`creating the tree failed: ${treeError.message}`)
    }

    console.log('✅ test tree created')

    // 4. Wait briefly, then clean up
    console.log('⏳ waiting 2 seconds')
    await new Promise((resolve) => setTimeout(resolve, 2000))

    console.log('🗑️ deleting test tree')
    await supabase.from('family_trees').delete().eq('family_id', newFamily.id)

    console.log('🗑️ deleting test family')
    await supabase.from('families').delete().eq('id', newFamily.id)

    console.log('✅ keep-alive done, database stays active')
  } catch (error) {
    console.error('❌ keep-alive failed:', error)
    process.exit(1)
  }
}

main()
