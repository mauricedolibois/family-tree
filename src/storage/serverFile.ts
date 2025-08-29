import { promises as fs } from 'fs'
import path from 'path'

export const DATA_DIR = path.join(process.cwd(), 'data')
export const FAMILY_FILE = path.join(DATA_DIR, 'family.json')

export async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true })
}

export async function readJson<T = any>(filePath: string): Promise<T | null> {
  try {
    const buf = await fs.readFile(filePath, 'utf8')
    return JSON.parse(buf) as T
  } catch (e: any) {
    if (e?.code === 'ENOENT') return null
    console.error('readJson failed:', e)
    return null
  }
}

export async function writeJsonAtomic(filePath: string, data: any) {
  await ensureDir(path.dirname(filePath))
  const tmp = `${filePath}.${Date.now()}.tmp`
  const json = JSON.stringify(data, null, 2)
  await fs.writeFile(tmp, json, 'utf8')
  await fs.rename(tmp, filePath)
}
