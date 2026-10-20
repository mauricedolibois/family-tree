// Confirms an email address from the link in the verification mail, then signs in.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { GetServerSideProps } from 'next'
import { AuthLayout, FormMessage, postJson } from '@/components/auth/AuthLayout'
import { useI18n } from '@/i18n/I18nProvider'
import { localeFromRequest } from '@/i18n/server'
import type { Locale } from '@/i18n/locales'

type Props = { token: string; locale: Locale }

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, params }) => ({
  props: { token: String(params?.token ?? ''), locale: localeFromRequest(req) },
})

export default function VerifyPage({ token }: Props) {
  const { t } = useI18n()
  const [state, setState] = useState<'checking' | 'done' | 'invalid'>('checking')
  // The token works once; React may run the effect twice in development
  const sent = useRef(false)

  useEffect(() => {
    if (sent.current) return
    sent.current = true
    postJson('/api/auth/verify', { token })
      .then(({ ok }) => {
        setState(ok ? 'done' : 'invalid')
        if (ok) setTimeout(() => (window.location.href = '/'), 1500)
      })
      .catch(() => setState('invalid'))
  }, [token])

  return (
    <AuthLayout title={t.verify.pageTitle}>
      {state === 'checking' && <p className="text-center text-ink-muted">{t.auth.wait}</p>}
      {state === 'done' && <FormMessage tone="info">{t.verify.done}</FormMessage>}
      {state === 'invalid' && (
        <div className="flex flex-col gap-3">
          <FormMessage>{t.verify.invalid}</FormMessage>
          <Link href="/login" className="text-[15px] text-link underline underline-offset-4">
            {t.forgot.back}
          </Link>
        </div>
      )}
    </AuthLayout>
  )
}
