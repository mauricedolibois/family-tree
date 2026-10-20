/**
 * @jest-environment node
 */
import { themeFromRequest } from '@/themes/server'
import { BAR_COLOR, THEMES } from '@/themes/themes'
import { MESSAGES } from '@/i18n/messages'
import { LOCALES } from '@/i18n/locales'

const req = (cookie?: string) => ({ headers: cookie ? { cookie } : {} })

describe('themes', () => {
  it('reads the choice from the cookies', () => {
    expect(themeFromRequest(req('theme=modern; mode=dark'))).toEqual({ theme: 'modern', mode: 'dark' })
    expect(themeFromRequest(req('mode=system'))).toEqual({ theme: 'classic', mode: 'system' })
  })

  it('falls back to classic and light for missing or unknown values', () => {
    expect(themeFromRequest(undefined)).toEqual({ theme: 'classic', mode: 'light' })
    expect(themeFromRequest(req('theme=%3Cscript%3E; mode=night'))).toEqual({ theme: 'classic', mode: 'light' })
  })

  it('every theme has bar colours and a name in every language', () => {
    for (const id of THEMES) {
      expect(BAR_COLOR[id].light).toMatch(/^#[0-9A-F]{6}$/i)
      expect(BAR_COLOR[id].dark).toMatch(/^#[0-9A-F]{6}$/i)
      for (const l of LOCALES) expect(MESSAGES[l].theme.names[id]).toBeTruthy()
    }
  })
})
