import Document, { Html, Head, Main, NextScript, type DocumentContext, type DocumentInitialProps } from 'next/document'
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales'
import { MESSAGES } from '@/i18n/messages'
import { themeFromRequest } from '@/themes/server'
import { BAR_COLOR, type Mode, type ThemeId } from '@/themes/themes'

type Props = DocumentInitialProps & { theme: ThemeId; mode: Mode }

export default class AppDocument extends Document<Props> {
  // The theme is rendered by the server from the visitor's cookies: no script, no flash
  static async getInitialProps(ctx: DocumentContext): Promise<Props> {
    const initial = await Document.getInitialProps(ctx)
    return { ...initial, ...themeFromRequest(ctx.req) }
  }

  render() {
    const { theme, mode } = this.props
    const pageLocale = this.props.__NEXT_DATA__.props?.pageProps?.locale
    const locale = isLocale(pageLocale) ? pageLocale : DEFAULT_LOCALE
    const bar = BAR_COLOR[theme]
    return (
      <Html lang={locale} data-theme={theme} data-mode={mode}>
        <Head>
          {mode === 'system' ? (
            <>
              <meta name="theme-color" content={bar.light} media="(prefers-color-scheme: light)" />
              <meta name="theme-color" content={bar.dark} media="(prefers-color-scheme: dark)" />
            </>
          ) : (
            <meta name="theme-color" content={bar[mode]} />
          )}
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
          <meta name="description" content={MESSAGES[locale].app.description} />
          <link rel="icon" href="/favicon.ico" sizes="any" />
          <link rel="icon" href="/icon.svg" type="image/svg+xml" />
          <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}
