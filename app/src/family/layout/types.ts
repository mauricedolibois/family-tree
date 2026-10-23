// src/family/layout/types.ts

export type Point = { x: number; y: number }

export type CardBox = {
  /** Person id */
  id: string
  x: number
  y: number
  w: number
  h: number
}

/** Line between two spouses */
export type MarriageLine = {
  id: string
  a: string
  b: string
  from: Point
  to: Point
}

/** Connector from parents to a child */
export type Connector = {
  id: string
  /** Parent ids (one or two people) */
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
  /** Gap between spouses (room for the ⚭ sign) */
  coupleGap: 30,
} as const
