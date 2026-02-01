/**
 * Keep-Alive Script für Supabase
 * 
 * Erstellt eine temporäre Test-Familie in der Datenbank und löscht sie wieder.
 * Verhindert, dass Supabase die Datenbank nach 7 Tagen Inaktivität pausiert.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Fehlende Umgebungsvariablen: SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
})

const KEEP_ALIVE_FAMILY_NAME = '__keep_alive_test_family__'

async function main() {
  console.log('🔄 Keep-Alive Script gestartet...')
  console.log(`📅 Zeitstempel: ${new Date().toISOString()}`)

  try {
    // 1. Prüfen ob bereits eine Test-Familie existiert und ggf. löschen
    console.log('🔍 Prüfe auf bestehende Test-Familie...')
    const { data: existingFamily } = await supabase
      .from('families')
      .select('id')
      .eq('name', KEEP_ALIVE_FAMILY_NAME)
      .single()

    if (existingFamily) {
      console.log('🗑️ Lösche alte Test-Familie...')
      
      // Zuerst den zugehörigen Baum löschen
      await supabase
        .from('family_trees')
        .delete()
        .eq('family_id', existingFamily.id)

      // Dann die Familie löschen
      await supabase
        .from('families')
        .delete()
        .eq('id', existingFamily.id)
    }

    // 2. Neue Test-Familie erstellen
    console.log('➕ Erstelle neue Test-Familie...')
    const { data: newFamily, error: createError } = await supabase
      .from('families')
      .insert({
        name: KEEP_ALIVE_FAMILY_NAME,
        pass_hash: 'keep_alive_dummy_hash'
      })
      .select()
      .single()

    if (createError) {
      throw new Error(`Fehler beim Erstellen der Familie: ${createError.message}`)
    }

    console.log(`✅ Test-Familie erstellt mit ID: ${newFamily.id}`)

    // 3. Test-Baum erstellen
    console.log('🌳 Erstelle Test-Familienbaum...')
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
            comments: `Automatisch erstellt am ${new Date().toISOString()}`
          }
        }
      }
    }

    const { error: treeError } = await supabase
      .from('family_trees')
      .insert({
        family_id: newFamily.id,
        tree_json: testTree,
        updated_at: new Date().toISOString()
      })

    if (treeError) {
      throw new Error(`Fehler beim Erstellen des Baums: ${treeError.message}`)
    }

    console.log('✅ Test-Familienbaum erstellt')

    // 4. Kurz warten und dann alles wieder löschen
    console.log('⏳ Warte 2 Sekunden...')
    await new Promise(resolve => setTimeout(resolve, 2000))

    console.log('🗑️ Lösche Test-Familienbaum...')
    await supabase
      .from('family_trees')
      .delete()
      .eq('family_id', newFamily.id)

    console.log('🗑️ Lösche Test-Familie...')
    await supabase
      .from('families')
      .delete()
      .eq('id', newFamily.id)

    console.log('✅ Bereinigung abgeschlossen')
    console.log('🎉 Keep-Alive erfolgreich! Datenbank bleibt aktiv.')

  } catch (error) {
    console.error('❌ Fehler im Keep-Alive Script:', error)
    process.exit(1)
  }
}

main()
