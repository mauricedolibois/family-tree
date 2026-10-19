// src/family/layout/elkClient.ts
// ELK im Browser: die schwere Berechnung läuft in einem Web Worker.

import ELK from 'elkjs/lib/elk-api'
import type { RunElk } from './compute'

let instance: InstanceType<typeof ELK> | null = null

function getElk() {
  if (!instance) {
    instance = new ELK({
      workerFactory: () => new Worker(new URL('./elk.worker.ts', import.meta.url)),
    })
  }
  return instance
}

export const runElkInWorker: RunElk = (graph) => getElk().layout(graph as never) as never
