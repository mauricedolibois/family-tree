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

// Theme "classic" with what mail programs have: serif fonts, the dark green binding,
// parchment and gold leaf. Web fonts are left out, many programs block them.
const SERIF = "'EB Garamond',Garamond,Georgia,'Times New Roman',serif"
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const C = {
  binding: '#1E3428',
  lettering: '#F5E6BE',
  gold: '#BA8E34',
  goldDeep: '#765416',
  desk: '#EADEC2',
  parchment: '#FAF4E4',
  rule: '#C4AC80',
  ink: '#2B1E14',
  inkMuted: '#695642',
  inkFaint: '#8A7760',
}

/** Gold rule with a lozenge in the middle, between the languages */
const ORNAMENT = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="border-bottom:1px solid ${C.rule};width:45%">&nbsp;</td>
<td align="center" style="padding:0 10px;color:${C.gold};font-size:12px;line-height:12px;white-space:nowrap">&#9670;</td>
<td style="border-bottom:1px solid ${C.rule};width:45%">&nbsp;</td>
</tr></table>`

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
<tr><td lang="${p.lang}" style="padding:${first ? '30px' : '0'} 36px 30px 36px">
${first ? '' : `${ORNAMENT}<div style="height:26px"></div>`}
<p style="margin:0 0 12px;font-family:${SERIF};font-size:19px;line-height:27px;color:${C.ink}">${escapeHtml(p.greeting)}</p>
<p style="margin:0 0 24px;font-family:${SERIF};font-size:18px;line-height:27px;color:${C.inkMuted}">${escapeHtml(p.body)}</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${C.binding};border:1px solid ${C.gold};border-radius:6px">
<a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 24px;font-family:${SERIF};font-size:17px;font-weight:600;line-height:22px;letter-spacing:0.02em;color:${C.lettering};text-decoration:none">${escapeHtml(p.button)}</a>
</td></tr></table>
</td></tr>`
  const titles = MAIL_LOCALES.map((lang) => MESSAGES[lang].app.title).join(' · ')
  const html = `<!doctype html>
<html lang="${
    parts[0].lang
  }"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.desk}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.desk}">
<tr><td align="center" style="padding:32px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.parchment};border:1px solid ${C.gold};border-radius:10px;border-collapse:separate;overflow:hidden">
<tr><td align="center" style="background:${C.binding};padding:22px 24px 20px 24px;border-bottom:2px solid ${C.gold}">
<p style="margin:0;font-family:${SERIF};font-size:12px;line-height:16px;letter-spacing:0.22em;text-transform:uppercase;color:${C.gold}">&#10086;&nbsp; ${escapeHtml(titles)} &nbsp;&#10086;</p>
${
  tree
    ? `<p style="margin:8px 0 0;font-family:${SERIF};font-size:26px;line-height:32px;color:${C.lettering}">${escapeHtml(tree)}</p>`
    : ''
}
</td></tr>
${parts.map((p, i) => section(p, i === 0)).join('')}
<tr><td style="padding:18px 36px 26px 36px;border-top:1px solid ${C.rule};background:${C.desk}">
<p style="margin:0 0 10px;font-family:${SANS};font-size:12px;line-height:18px;color:${C.inkFaint};word-break:break-all"><a href="${escapeHtml(
    link,
  )}" style="color:${C.goldDeep}">${escapeHtml(link)}</a></p>
${parts
  .map(
    (p) =>
      `<p lang="${p.lang}" style="margin:0;font-family:${SANS};font-size:12px;line-height:18px;color:${C.inkFaint}">${escapeHtml(p.footer)}</p>`,
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
