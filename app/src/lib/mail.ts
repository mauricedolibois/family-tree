// src/lib/mail.ts
// Outgoing mail over SMTP. Configured through prod.env:
//
//   MAIL_ENABLED=true
//   SMTP_HOST=smtp.example.org   SMTP_PORT=587   SMTP_SECURE=false (true for port 465)
//   SMTP_USER=…                  SMTP_PASSWORD=…
//   MAIL_FROM="Family tree <tree@example.org>"
//   APP_URL=https://tree.example.org
//
// Without mail the app shows the same links to the admin to pass on by hand.

import nodemailer, { type Transporter } from 'nodemailer'
import { appUrl, flag, mailEnabled } from './features'
import { logError } from './log'
import { MESSAGES } from '@/i18n/messages'
import type { Locale } from '@/i18n/locales'

let transport: Transporter | null = null

function getTransport(): Transporter {
  if (transport) return transport
  const port = Number(process.env.SMTP_PORT ?? 587)
  const user = process.env.SMTP_USER
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE ? flag(process.env.SMTP_SECURE) : port === 465,
    auth: user ? { user, pass: process.env.SMTP_PASSWORD ?? '' } : undefined,
  })
  return transport
}

/** Mail can actually go out: switched on and the links in it have an address to point to */
export const canSendMail = () => mailEnabled() && !!process.env.SMTP_HOST && !!appUrl()

export type MailKind = 'invite' | 'verify' | 'reset'

type MailInput = {
  kind: MailKind
  to: string
  path: string
  name?: string
  tree?: string
}

/** Every mail carries these languages, one after the other */
export const MAIL_LOCALES: readonly Locale[] = ['de', 'en']

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

/** Subject, plain text and HTML, German first and English below */
export function renderMail({ kind, path, name, tree }: Omit<MailInput, 'to'>, base: string) {
  const link = base + path
  const parts = MAIL_LOCALES.map((lang) => ({
    lang,
    footer: MESSAGES[lang].mail.footer,
    ...MESSAGES[lang].mail[kind]({ name: name ?? '', tree: tree ?? '' }),
  }))

  const subject = parts.map((p) => p.subject).join(' · ')
  const text = [
    ...parts.map((p) => `${p.greeting}\n\n${p.body}\n\n${p.button}: ${link}`),
    parts.map((p) => p.footer).join('\n'),
  ].join('\n\n———\n\n')

  // Tables and inline styles, because many mail programs ignore anything else
  const section = (p: (typeof parts)[number], first: boolean) => `
<tr><td lang="${p.lang}" style="padding:${first ? '32px' : '28px'} 32px 0 32px;${
    first ? '' : 'border-top:1px solid #e4e4e7;'
  }">
<p style="margin:0 0 12px;font-size:16px;line-height:24px;color:#18181b">${escapeHtml(p.greeting)}</p>
<p style="margin:0 0 20px;font-size:16px;line-height:24px;color:#3f3f46">${escapeHtml(p.body)}</p>
<a href="${escapeHtml(
    link,
  )}" style="display:inline-block;background:#1E3428;color:#ffffff;font-size:15px;font-weight:600;line-height:20px;padding:12px 20px;border-radius:8px;text-decoration:none">${escapeHtml(
    p.button,
  )}</a>
<div style="height:28px"></div>
</td></tr>`
  const html = `<!doctype html>
<html lang="${
    parts[0].lang
  }"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;font-family:${FONT}">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px">
${parts.map((p, i) => section(p, i === 0)).join('')}
<tr><td style="padding:20px 32px 28px 32px;border-top:1px solid #e4e4e7">
<p style="margin:0 0 12px;font-size:13px;line-height:20px;color:#71717a;word-break:break-all"><a href="${escapeHtml(
    link,
  )}" style="color:#71717a">${escapeHtml(link)}</a></p>
${parts
  .map(
    (p) =>
      `<p lang="${p.lang}" style="margin:0;font-size:13px;line-height:20px;color:#a1a1aa">${escapeHtml(p.footer)}</p>`,
  )
  .join('\n')}
</td></tr>
</table>
</td></tr>
</table>
</body></html>`
  return { subject, text, html }
}

/** Sends the mail if possible; false means the caller should show the link instead */
export async function sendMail(input: MailInput): Promise<boolean> {
  const base = appUrl()
  if (!canSendMail() || !base) return false
  try {
    const { subject, text, html } = renderMail(input, base)
    await getTransport().sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: input.to,
      subject,
      text,
      html,
    })
    return true
  } catch (err) {
    logError('mail', err)
    return false
  }
}
