import { useState } from 'react'
import bridge from '../lib/bridge'
import AppLogoIcon from '../components/AppLogoIcon'

const IS_ELECTRON = typeof window !== 'undefined' && window.electronAPI !== undefined
const BANNER_DISMISSED_KEY = 'wealthlens_defaults_banner_dismissed'

export default function Login({ onSignIn }) {
  const [mobile, setMobile]     = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError]       = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showBanner, setShowBanner] = useState(() => !localStorage.getItem(BANNER_DISMISSED_KEY))

  function dismissBanner() {
    localStorage.setItem(BANNER_DISMISSED_KEY, '1')
    setShowBanner(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!mobile || !password || submitting) return
    setError('')
    setSubmitting(true)
    try {
      const result = await bridge.login({ mobile_number: mobile, password })
      if (IS_ELECTRON) {
        if (!result?.success) { setError('Invalid mobile number or password'); return }
        onSignIn(result.user)
      } else {
        localStorage.setItem('wealthlens_token', result.token)
        onSignIn(result.user)
      }
    } catch {
      setError('Invalid mobile number or password')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: '#1a1a2e' }}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <AppLogoIcon size={56} />
          <div className="text-center">
            <h1 className="text-white font-bold text-2xl tracking-tight">Lifelog</h1>
            <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Your life, logged.</p>
          </div>
        </div>

        {showBanner && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-4">
            <p className="text-xs font-semibold text-amber-800 flex-1">Default credentials set — change them in Settings immediately.</p>
            <button onClick={dismissBanner} className="text-amber-500 hover:text-amber-700 text-xs font-bold leading-none" aria-label="Dismiss">✕</button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-8 shadow-2xl space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Mobile Number</label>
            <div className="flex items-stretch rounded-xl border border-gray-200 overflow-hidden focus-within:border-[#6C63FF] focus-within:ring-2 focus-within:ring-[#6C63FF]/20">
              <span className="flex items-center px-3 text-sm font-medium text-gray-500 bg-gray-50 border-r border-gray-200">+91</span>
              <input
                autoFocus
                type="tel"
                inputMode="numeric"
                placeholder="9000000001"
                value={mobile}
                onChange={e => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className="flex-1 min-w-0 px-4 py-3 text-base font-medium text-gray-900 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Password</label>
            <div className="flex items-stretch rounded-xl border border-gray-200 overflow-hidden focus-within:border-[#6C63FF] focus-within:ring-2 focus-within:ring-[#6C63FF]/20">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="flex-1 min-w-0 px-4 py-3 text-base font-medium text-gray-900 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                className="px-3 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          {error && <p className="text-sm font-medium text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={!mobile || !password || submitting}
            className="w-full py-3 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
            style={{ backgroundColor: '#6C63FF' }}
          >
            {submitting ? 'Signing in…' : 'Sign In'}
          </button>

          <p className="text-center text-xs text-gray-400">Forgot password? Contact admin</p>
        </form>
      </div>
    </div>
  )
}
