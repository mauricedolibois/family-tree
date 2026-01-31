// src/debug/serializeTagged.ts
import { IMember } from '@/types/IMember'
import { StoredTree, serializeFromRoot as realSerialize } from '@/storage/schema'

export function serializeTagged(tag: string, root: IMember, existing?: StoredTree | null): StoredTree {
  const res = realSerialize(root, existing ?? undefined)
  // TAG + Stacktrace (nur im Dev)
  // Achtung: console.trace flutet – nach der Analyse bitte wieder entfernen.
  // @ts-ignore
  // @ts-ignore
  console.trace(`[TRACE@${tag}]`)
  return res
}
