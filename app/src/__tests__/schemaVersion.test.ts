/**
 * @jest-environment node
 */
import fs from 'fs'
import path from 'path'
import { REQUIRED_SCHEMA } from '@/lib/schema'

// The app has to ask for the version setup.sql and the newest migration create,
// otherwise it would not warn when a migration is missing
describe('database version', () => {
  const supabase = path.join(__dirname, '../../../supabase')

  it('matches setup.sql', () => {
    const setup = fs.readFileSync(path.join(supabase, 'setup.sql'), 'utf8')
    const version = /values \('schema_version', '(\d+)'\)/.exec(setup)?.[1]
    expect(Number(version)).toBe(REQUIRED_SCHEMA)
  })

  it('matches the newest migration', () => {
    const versions = fs
      .readdirSync(path.join(supabase, 'migrations'))
      .map((f) => Number(/^v(\d+)_/.exec(f)?.[1]))
      .filter(Boolean)
    expect(Math.max(...versions)).toBe(REQUIRED_SCHEMA)
  })
})
