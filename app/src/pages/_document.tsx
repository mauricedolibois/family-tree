import { Html, Head, Main, NextScript } from 'next/document'
import { THEME_SCRIPT } from '@/lib/themeScript'

export default function Document() {
  return (
    <Html lang="de">
      <Head>
        <meta name="theme-color" content="#1E3428" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="description" content="Unser Stammbaum" />
        <link rel="icon" href="/favicon.ico" />
        {/* Apply the chosen theme before the first paint (no flash) */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
