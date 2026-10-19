// src/lib/ids.ts

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)

/** Tree id from a route or query parameter; anything that is not a UUID never reaches the database */
export function treeIdParam(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value
  return isUuid(v) ? v.toLowerCase() : null
}
