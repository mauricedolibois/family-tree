// src/family/layout/types.ts

export type Point = { x: number; y: number }

export type CardBox = {
  /** Personen-ID */
  id: string
  x: number
  y: number
  w: number
  h: number
}

/** Linie zwischen zwei Ehepartnern */
export type MarriageLine = {
  id: string
  a: string
  b: string
  from: Point
  to: Point
}

/** Verbindung von Eltern zu einem Kind */
export type Connector = {
  id: string
  /** Eltern-IDs (eine oder zwei Personen) */
  parents: string[]
  child: string
  points: Point[]
  adopted: boolean
}

export type TreeLayout = {
  cards: CardBox[]
  marriages: MarriageLine[]
  connectors: Connector[]
  width: number
  height: number
}

export const CARD = {
  w: 184,
  h: 68,
  /** Abstand zwischen Ehepartnern (Platz für das ⚭-Zeichen) */
  coupleGap: 30,
} as const
