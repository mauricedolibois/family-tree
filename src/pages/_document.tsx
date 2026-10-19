import { Html, Head, Main, NextScript, type DocumentProps } from 'next/document'

export default function Document(props: DocumentProps) {
  // Sprache der Seite (vom Server ermittelt), damit Vorlesefunktionen richtig betonen
  const lang = props.__NEXT_DATA__.props?.pageProps?.lang === 'en' ? 'en' : 'de'
  return (
    <Html lang={lang}>
      <Head>
        <meta name="theme-color" content="#1E3428" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="description" content="Unser Stammbaum" />
        <link rel="icon" href="/favicon.ico" />
        {/* Gewähltes Licht vor dem ersten Zeichnen setzen (kein Aufblitzen) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('stammbaum:licht')==='night')document.documentElement.dataset.theme='night'}catch(e){}`,
          }}
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
