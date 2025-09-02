import { useState } from 'react'

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login') // <- standardmäßig Login zuerst (anders herum)
  const [familyName, setFamilyName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!familyName.trim() || !password) {
      setError('Bitte Familienname und Passwort angeben.')
      return
    }

    setLoading(true)
    try {
      const url = mode === 'register' ? '/api/auth/register' : '/api/auth/login'
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          familyName: familyName.trim(),
          password,
        }),
        // keine credentials nötig; Set-Cookie kommt vom Server und Browser speichert es
      })

      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || `Fehler: ${res.status}`)
      }

      // WICHTIG: harter Redirect, damit das httpOnly-Cookie garantiert aktiv ist
      window.location.href = '/'
    } catch (err: any) {
      setError(err.message || 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md">
        <div className="bg-white shadow-md rounded-2xl overflow-hidden">
          {/* Tabs */}
          <div className="flex">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex-1 py-3 text-center text-sm font-medium ${
                mode === 'login' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Anmelden
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`flex-1 py-3 text-center text-sm font-medium ${
                mode === 'register' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Registrieren
            </button>
          </div>

          <form onSubmit={onSubmit} className="p-6 space-y-4">
            <div className="space-y-1">
              <label className="text-sm text-gray-700">Familienname</label>
              <input
                className="w-full border rounded-lg p-2 outline-none focus:ring-2 focus:ring-gray-900/20"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                placeholder="z. B. Familie Müller"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm text-gray-700">Passwort</label>
              <input
                type="password"
                className="w-full border rounded-lg p-2 outline-none focus:ring-2 focus:ring-gray-900/20"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gray-900 text-white rounded-lg py-2 hover:bg-black transition disabled:opacity-60"
            >
              {loading ? 'Bitte warten…' : mode === 'register' ? 'Registrieren' : 'Anmelden'}
            </button>
          </form>
        </div>

        <p className="text-xs text-gray-500 mt-4 text-center">
          Tipp: Du kannst jederzeit zwischen „Anmelden“ und „Registrieren“ oben wechseln.
        </p>
      </div>
    </main>
  )
}
