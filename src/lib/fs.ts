// src/lib/fs.ts
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'

export const ROOT = process.cwd()

export function abs(...p: string[]) {
  return path.join(ROOT, ...p)
}

export async function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) await fsp.mkdir(dir, { recursive: true })
}

export async function readJSON<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fsp.readFile(file, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export async function writeJSON(file: string, data: unknown) {
  await ensureDir(path.dirname(file))
  await fsp.writeFile(file, JSON.stringify(data, null, 2), 'utf8')
}
