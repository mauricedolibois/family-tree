// src/utils/layout/debug.ts
export const DEBUG_LAYOUT = true
export const dbg = (...args: any[]) => { if (DEBUG_LAYOUT) console.debug('[familyLayout]', ...args) }
