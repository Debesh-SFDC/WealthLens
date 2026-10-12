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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-hidden"
      style={{
        backgroundColor: '#0A0A0A',
        backgroundImage: [
          'radial-gradient(ellipse 60% 45% at 50% 0%, rgba(212,175,55,0.14) 0%, transparent 70%)',
          'radial-gradient(ellipse 50% 40% at 50% 100%, rgba(184,150,12,0.08) 0%, transparent 70%)',
          'repeating-linear-gradient(45deg, rgba(212,175,55,0.035) 0 1px, transparent 1px 28px)',
          'repeating-linear-gradient(-45deg, rgba(212,175,55,0.035) 0 1px, transparent 1px 28px)',
        ].join(', '),
      }}
    >
      <div className="relative w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div style={{ filter: 'drop-shadow(0 0 24px rgba(212,175,55,0.35))' }}><AppLogoIcon size={56} /></div>
          <div className="text-center">
            <h1 className="text-gold-gradient font-bold text-3xl tracking-tight">Lifelog</h1>
            <p className="text-sm mt-1" style={{ color: '#A0A0A0' }}>Your life, logged.</p>
          </div>
        </div>

        {showBanner && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-4">
            <p className="text-xs font-semibold text-amber-800 flex-1">Default credentials set — change them in Settings immediately.</p>
            <button onClick={dismissBanner} className="text-amber-500 hover:text-amber-700 text-xs font-bold leading-none" aria-label="Dismiss">✕</button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="rounded-2xl p-8 shadow-2xl space-y-4" style={{ backgroundColor: '#111111', border: '1px solid #D4AF3760', boxShadow: '0 24px 64px rgba(0,0,0,0.7), 0 0 40px rgba(212,175,55,0.06)' }}>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Mobile Number</label>
            <div className="flex items-stretch rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] overflow-hidden focus-within:border-[#D4AF37] focus-within:ring-2 focus-within:ring-[#D4AF37]/20">
              <span className="flex items-center px-3 text-sm font-medium text-[#D4AF37] bg-[#1A1A1A] border-r border-[#2A2A2A]">+91</span>
              <input
                autoFocus
                type="tel"
                inputMode="numeric"
                placeholder="9000000001"
                value={mobile}
                onChange={e => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className="flex-1 min-w-0 px-4 py-3 text-base font-medium text-gray-900 focus:outline-none" style={{ boxShadow: 'none' }}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Password</label>
            <div className="flex items-stretch rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] overflow-hidden focus-within:border-[#D4AF37] focus-within:ring-2 focus-within:ring-[#D4AF37]/20">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="flex-1 min-w-0 px-4 py-3 text-base font-medium text-gray-900 focus:outline-none" style={{ boxShadow: 'none' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                className="px-3 text-gray-400 hover:text-[#D4AF37] transition-colors"
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
            className="btn-gold w-full py-3 rounded-xl text-sm font-bold disabled:opacity-40"
          >
            {submitting ? 'Signing in…' : 'Sign In'}
          </button>

          <p className="text-center text-xs text-[#606060]">Forgot password? Contact admin</p>
        </form>
      </div>
    </div>
  )
}
