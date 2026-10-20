// Building blocks of the admin page and the members page of a tree.

import { useState } from 'react'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/i18n/I18nProvider'
import type { Role } from '@/lib/accounts'

export const fullUrl = (path: string) => (typeof window === 'undefined' ? path : window.location.origin + path)

export const selectClass = 'field h-9 py-0 text-sm'

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="parchment rounded-card border border-gilt/60 p-4 shadow-card sm:p-5">
      <h2 className="mb-3 font-display text-[1.4rem] text-ink">{title}</h2>
      {children}
    </section>
  )
}

/** A link to pass on, with a copy button */
export function LinkBox({ path, note }: { path: string; note: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const url = fullUrl(path)
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-control border border-gilt/60 bg-gilt-soft/40 p-3">
      <p className="text-sm text-ink">{note}</p>
      <div className="flex items-center gap-2">
        <input readOnly value={url} className="field h-9 flex-1 text-sm" onFocus={(e) => e.target.select()} />
        <Button
          size="sm"
          icon={<Copy className="h-4 w-4" />}
          onClick={async () => {
            await navigator.clipboard.writeText(url).catch(() => undefined)
            setCopied(true)
          }}
        >
          {copied ? t.subscribe.copied : t.admin.copy}
        </Button>
      </div>
    </div>
  )
}

export function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-linen-tint px-2 py-0.5 text-[12px] font-medium text-linen">{children}</span>
}

/** Role choice for a tree, from least to most rights */
export function RoleSelect({
  value,
  onChange,
  disabled,
  className,
  label,
}: {
  value: string
  onChange: (role: Role) => void
  disabled?: boolean
  className?: string
  /** For screen readers when no visible label is attached */
  label?: string
}) {
  const { t } = useI18n()
  return (
    <select
      className={className ?? selectClass}
      value={value}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => onChange(e.target.value as Role)}
    >
      <option value="viewer">{t.roles.viewer}</option>
      <option value="editor">{t.roles.editor}</option>
      <option value="moderator">{t.roles.moderator}</option>
    </select>
  )
}

/** Sends a form with a file (multipart); same answer shape as postJson */
export async function sendForm(url: string, form: FormData) {
  const res = await fetch(url, { method: 'POST', body: form })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { status: res.status, ok: res.ok, data }
}
