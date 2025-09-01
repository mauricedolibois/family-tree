import { useState } from 'react'
import { useRouter } from 'next/router'
import { Button } from '@zendeskgarden/react-buttons'
import type { GetServerSideProps } from 'next'
import * as cookie from 'cookie'
import { parse } from 'cookie'

export const getServerSideProps: GetServerSideProps = async ({ req }) => {
  const parsed = parse(req.headers.cookie || '')
  if (parsed.fid) {
    return { redirect: { destination: '/', permanent: false } }
  }
  return { props: {} }
}

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const url = mode === 'login' ? '/api/auth/login' : '/api/auth/register'
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password }),
    })
    const data = await res.json()
    if (!res.ok) {
    setError(data?.error || 'Fehler bei der Anmeldung')
    return
    }
    // Wichtig: harter Reload, damit Cookie garantiert aktiv ist
    window.location.href = '/'
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-sm border rounded-xl p-6 shadow bg-white">
        <h1 className="text-2xl font-semibold mb-6 text-center text-slate-700">
          Family Service
        </h1>
        <div className="flex gap-2 mb-6 justify-center">
          <Button isBasic={mode !== 'login'} onClick={() => setMode('login')}>
            Login
          </Button>
          <Button
            isBasic={mode !== 'register'}
            onClick={() => setMode('register')}
          >
            Registrieren
          </Button>
        </div>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <label className="text-sm text-left">
            Familienname
            <input
              className="border rounded w-full p-2 mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z. B. Müller"
            />
          </label>
          <label className="text-sm text-left">
            Passwort
            <input
              type="password"
              className="border rounded w-full p-2 mt-1"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
            />
          </label>
          {error && (
            <div className="text-red-600 text-sm text-center">{error}</div>
          )}
          <Button isPrimary type="submit">
            {mode === 'login' ? 'Login' : 'Registrieren'}
          </Button>
        </form>
      </div>
    </main>
  )
}
