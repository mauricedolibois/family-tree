// src/components/auth/AuthLayout.tsx
// Book-cover frame shared by sign-in, invitation, password reset and similar pages.

import Head from 'next/head'
import { Flourish } from '@/components/ui/Flourish'
import { LanguagePicker } from '@/components/ui/LanguagePicker'
import { ThemePicker } from '@/components/ui/ThemePicker'
import { useI18n } from '@/i18n/I18nProvider'

export function AuthLayout({
  title,
  intro,
  children,
  footer,
}: {
  /** Browser tab title */
  title: string
  intro?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  const { t } = useI18n()
  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>
      <main className="header-bar cover grid min-h-dvh place-items-center p-4 sm:p-8">
        <div className="w-full max-w-[26rem]">
          <div className="framed px-6 pb-7 pt-9 text-center sm:px-10">
            <p className="ornament font-display text-[1.05rem] italic text-accent/80">{t.auth.kicker}</p>
            <h1 className="title-text mt-1 font-display text-[3.4rem] leading-none">{t.app.title}</h1>
            <Flourish className="mx-auto mt-3 max-w-[14rem]" />
            {intro && (
              <p className="mx-auto mt-3 max-w-[20rem] text-balance font-text text-[17px] text-on-primary/70">
                {intro}
              </p>
            )}
          </div>

          <div className="surface mt-5 rounded-panel border border-frame/60 p-5 shadow-lifted sm:p-6">{children}</div>

          {footer && <div className="mt-4 text-center text-[15px] text-on-primary/75">{footer}</div>}
          <div className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2">
            <LanguagePicker tone="cover" />
            <ThemePicker tone="cover" />
          </div>
        </div>
      </main>
    </>
  )
}

/** Error or notice inside a form */
export function FormMessage({ tone = 'error', children }: { tone?: 'error' | 'info'; children: React.ReactNode }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={
        tone === 'error'
          ? 'rounded-control bg-danger-soft px-3 py-2 text-sm text-danger'
          : 'rounded-control bg-accent-soft/60 px-3 py-2 text-sm text-accent-deep'
      }
    >
      {children}
    </p>
  )
}

/** Labelled input as used on all account pages */
export function Field({
  id,
  label,
  hint,
  ...input
}: { id: string; label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input id={id} className="field" {...input} />
      {hint && <p className="mt-1.5 text-sm text-ink-faint">{hint}</p>}
    </div>
  )
}

/** POST JSON and return status plus parsed body (empty object if none) */
export async function postJson(url: string, body: unknown, method = 'POST') {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { status: res.status, ok: res.ok, data }
}
