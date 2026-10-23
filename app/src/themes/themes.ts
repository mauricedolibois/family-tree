// src/themes/themes.ts
// The themes of the interface, set up like the languages: each theme is a CSS file
// in src/styles/themes/ that sets the same variables and slots, and the choice is
// stored in cookies so the server renders the first page in it (see docs/themes.md).

/** Design: how the interface looks */
export const THEMES = ['classic', 'modern'] as const
export type ThemeId = (typeof THEMES)[number]

/** Light or dark; "system" follows the device */
export const MODES = ['light', 'dark', 'system'] as const
export type Mode = (typeof MODES)[number]

export const DEFAULT_THEME: ThemeId = 'classic'
export const DEFAULT_MODE: Mode = 'light'

export const THEME_COOKIE = 'theme'
export const MODE_COOKIE = 'mode'

export const isTheme = (value: unknown): value is ThemeId => THEMES.includes(value as ThemeId)
export const isMode = (value: unknown): value is Mode => MODES.includes(value as Mode)

/** Colour of the browser bar on phones (meta theme-color), the header colour of each theme */
export const BAR_COLOR: Record<ThemeId, { light: string; dark: string }> = {
  classic: { light: '#1E3428', dark: '#121F18' },
  modern: { light: '#18181B', dark: '#3F3F46' },
}
