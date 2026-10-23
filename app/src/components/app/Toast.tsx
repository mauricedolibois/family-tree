// src/components/app/Toast.tsx
// Short feedback after an action, optionally with a follow-up action and "Undo".

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useI18n } from '@/i18n/I18nProvider'
import { TreeConflictError, type Undo } from './FamilyProvider'

type Toast = { message: string; action?: { label: string; run: () => void }; undo?: Undo }
type Ctx = { notify: (t: Toast) => void }

const ToastCtx = createContext<Ctx>({ notify: () => {} })
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(Toast & { id: number }) | null>(null)
  const { t } = useI18n()
  const notify = useCallback((next: Toast) => setToast({ ...next, id: Date.now() }), [])

  const undo = async (run: Undo) => {
    setToast(null)
    try {
      await run()
      notify({ message: t.history.undone })
    } catch (err) {
      // A conflict already shows its own notice
      if (!(err instanceof TreeConflictError)) notify({ message: t.common.retry })
    }
  }

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), toast.action || toast.undo ? 8000 : 3500)
    return () => clearTimeout(timer)
  }, [toast])

  return (
    <ToastCtx.Provider value={{ notify }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-16 z-[70] flex justify-center px-3">
        {toast && (
          <div
            key={toast.id}
            className="pointer-events-auto flex max-w-md items-center gap-3 rounded-full bg-primary py-2 pl-4 pr-2 text-[15px] text-on-primary shadow-lifted"
          >
            <span>{toast.message}</span>
            {toast.undo && (
              <button
                type="button"
                onClick={() => void undo(toast.undo!)}
                className="rounded-full px-3 py-1 text-sm font-medium text-on-primary underline decoration-accent/70 underline-offset-4 hover:bg-on-primary/10"
              >
                {t.history.undo}
              </button>
            )}
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action!.run()
                  setToast(null)
                }}
                className="rounded-full bg-accent px-3 py-1 text-sm font-medium text-on-accent hover:bg-accent/85"
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastCtx.Provider>
  )
}
