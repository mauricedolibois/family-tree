// src/components/app/Toast.tsx
// Kurze Rückmeldung nach einer Aktion, optional mit einer Folgeaktion.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

type Toast = { message: string; action?: { label: string; run: () => void } }
type Ctx = { notify: (t: Toast) => void }

const ToastCtx = createContext<Ctx>({ notify: () => {} })
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(Toast & { id: number }) | null>(null)
  const notify = useCallback((t: Toast) => setToast({ ...t, id: Date.now() }), [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), toast.action ? 7000 : 3500)
    return () => clearTimeout(timer)
  }, [toast])

  return (
    <ToastCtx.Provider value={{ notify }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-16 z-[70] flex justify-center px-3">
        {toast && (
          <div
            key={toast.id}
            className="pointer-events-auto flex max-w-md items-center gap-3 rounded-full bg-linen py-2 pl-4 pr-2 text-[15px] text-card shadow-lifted"
          >
            <span>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action!.run()
                  setToast(null)
                }}
                className="rounded-full bg-gilt px-3 py-1 text-sm font-medium text-linen-deep hover:bg-gilt-soft"
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
