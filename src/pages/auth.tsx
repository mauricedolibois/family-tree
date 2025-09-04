import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [familyName, setFamilyName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

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
      })

      if (!res.ok) {
        if (mode === 'login' && res.status === 401) {
          throw new Error('Falscher Familienname oder Passwort.')
        }
        if (mode === 'register' && res.status === 409) {
          throw new Error('Dieser Familienname ist bereits vergeben.')
        }
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || `Fehler: ${res.status}`)
      }

      window.location.href = '/'
    } catch (err: any) {
      setError(err.message || 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[color:var(--color-surface-100)] p-4 sm:p-6">
      <div className="w-full max-w-md">
        <div className="bg-white shadow-lg rounded-2xl overflow-hidden">
          {/* Tabs */}
          <div className="flex">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex-1 py-3 text-center text-sm font-medium transition-colors border-0 ${
                mode === 'login'
                  ? 'bg-[color:var(--color-primary)] text-white'
                  : 'bg-[color:var(--color-surface-50)] text-gray-600 hover:bg-[color:var(--color-surface-100)]'
              }`}
            >
              Anmelden
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`flex-1 py-3 text-center text-sm font-medium transition-colors border-0 ${
                mode === 'register'
                  ? 'bg-[color:var(--color-primary)] text-white'
                  : 'bg-[color:var(--color-surface-50)] text-gray-600 hover:bg-[color:var(--color-surface-100)]'
              }`}
            >
              Registrieren
            </button>
          </div>

          <form onSubmit={onSubmit} className="p-6 space-y-5">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Familienname</label>
              <input
                className="w-full border border-gray-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--color-primary-100)]"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                placeholder="z. B. Familie Müller"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Passwort</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="w-full border border-gray-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--color-primary-100)] pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[color:var(--color-primary)] text-white rounded-lg py-2 text-sm sm:text-base font-medium hover:bg-[color:var(--color-primary-700)] transition disabled:opacity-60"
            >
              {loading ? 'Bitte warten…' : mode === 'register' ? 'Registrieren' : 'Anmelden'}
            </button>
          </form>
        </div>

        <p className="text-xs text-gray-500 mt-4 text-center max-w-sm mx-auto leading-relaxed">
          Tipp: Du kannst jederzeit zwischen „Anmelden“ und „Registrieren“ oben wechseln.
        </p>
      </div>
    </main>
  )
}
