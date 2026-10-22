// src/themes/server.ts
// Theme of a request, from the visitor's cookies; defaults otherwise.

import type { IncomingMessage } from 'http'
import { parseCookie } from 'cookie'
import {
  DEFAULT_MODE,
  DEFAULT_THEME,
  MODE_COOKIE,
  THEME_COOKIE,
  isMode,
  isTheme,
  type Mode,
  type ThemeId,
} from './themes'

export function themeFromRequest(req: Pick<IncomingMessage, 'headers'> | undefined): { theme: ThemeId; mode: Mode } {
  const cookies = req?.headers.cookie ? parseCookie(req.headers.cookie) : {}
  return {
    theme: isTheme(cookies[THEME_COOKIE]) ? cookies[THEME_COOKIE] : DEFAULT_THEME,
    mode: isMode(cookies[MODE_COOKIE]) ? cookies[MODE_COOKIE] : DEFAULT_MODE,
  }
}
