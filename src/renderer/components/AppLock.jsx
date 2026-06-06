import { useState, useEffect, useRef } from 'react'
import AppLogoIcon from './AppLogoIcon'

function getStrength(password) {
  if (!password) return null
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  const levels = [
    { label: 'Too Short',   color: '#9CA3AF', pct: 8   },
    { label: 'Weak',        color: '#EF4444', pct: 22  },
    { label: 'Fair',        color: '#F59E0B', pct: 45  },
    { label: 'Good',        color: '#3B82F6', pct: 65  },
    { label: 'Strong',      color: '#10B981', pct: 85  },
    { label: 'Very Strong', color: '#059669', pct: 100 },
  ]
  return levels[Math.min(score, 5)]
}

const EyeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
)
const EyeOffIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
)
const LockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
)
const ShieldIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
)

export default function AppLock({ onUnlocked, isSetup }) {
  const [password, setPassword]       = useState('')
  const [confirm, setConfirm]         = useState('')
  const [showPwd, setShowPwd]         = useState(false)
  const [error, setError]             = useState('')
  const [loading, setLoading]         = useState(false)
  const [lockoutSec, setLockoutSec]   = useState(0)
  const [attempts, setAttempts]       = useState(0)
  const timerRef = useRef(null)

  useEffect(() => {
    window.electronAPI.getAuthLockoutStatus().then(s => {
      if (s.locked) startCountdown(s.waitSec)
      setAttempts(s.attempts || 0)
    })
    return () => clearInterval(timerRef.current)
  }, [])

  function startCountdown(sec) {
    setLockoutSec(sec)
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setLockoutSec(s => {
        if (s <= 1) { clearInterval(timerRef.current); return 0 }
        return s - 1
      })
    }, 1000)
  }

  const strength = isSetup ? getStrength(password) : null
  const isWeak   = isSetup && strength && ['Too Short', 'Weak', 'Fair'].includes(strength.label)

  async function handleSubmit(e) {
    e.preventDefault()
    if (lockoutSec > 0 || loading) return
    setError('')

    if (isSetup) {
      if (password.length < 8) { setError('Password must be at least 8 characters'); return }
      if (isWeak) { setError('Please choose a stronger password (mix letters, numbers, symbols)'); return }
      if (password !== confirm) { setError('Passwords do not match'); return }
      setLoading(true)
      try {
        const r = await window.electronAPI.setAppPassword(password)
        if (r.success) onUnlocked()
        else setError(r.error || 'Failed to set password')
      } finally { setLoading(false) }
    } else {
      setLoading(true)
      try {
        const r = await window.electronAPI.verifyAppPassword(password)
        if (r.success) {
          onUnlocked()
        } else {
          setPassword('')
          if (r.lockout) startCountdown(r.waitSec)
          if (r.attempts !== undefined) setAttempts(r.attempts)
          setError(r.error || 'Incorrect password')
        }
      } finally { setLoading(false) }
    }
  }

  const remainingAttempts = 5 - attempts
  const showAttemptsWarning = !isSetup && attempts > 0 && lockoutSec === 0

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
      style={{ backgroundColor: '#0f0f1e' }}
    >
      {/* Subtle radial glow behind logo */}
      <div
        className="absolute"
        style={{
          width: 480,
          height: 480,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(108,99,255,0.12) 0%, transparent 70%)',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}
      />

      <div className="relative w-full max-w-sm mx-auto px-6">
        {/* Logo + branding */}
        <div className="flex flex-col items-center mb-8">
          <AppLogoIcon size={72} />
          <h1 className="mt-4 text-3xl font-bold text-white tracking-tight">WealthLens</h1>
          <p className="mt-2 text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {isSetup ? 'Set a password to protect your financial data' : 'Enter your password to continue'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="px-6 pt-5 pb-2 border-b border-gray-100 flex items-center gap-2">
            <span className="text-[#6C63FF]">
              {isSetup ? <ShieldIcon /> : <LockIcon />}
            </span>
            <div>
              <p className="text-sm font-bold text-gray-900">
                {isSetup ? 'Create App Password' : 'Welcome Back'}
              </p>
              <p className="text-xs text-gray-400">
                {isSetup
                  ? 'Required every time you open WealthLens'
                  : 'Your data is securely encrypted'}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Password input */}
            <div className="relative">
              <input
                autoFocus
                type={showPwd ? 'text' : 'password'}
                placeholder={isSetup ? 'Create a strong password' : 'Password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                disabled={lockoutSec > 0 || loading}
                className="w-full px-4 py-3 pr-11 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20 disabled:bg-gray-50 disabled:text-gray-400"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPwd(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 transition-colors"
              >
                {showPwd ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>

            {/* Password strength (setup only) */}
            {isSetup && password && strength && (
              <div className="space-y-1">
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${strength.pct}%`, backgroundColor: strength.color }}
                  />
                </div>
                <p className="text-xs font-semibold" style={{ color: strength.color }}>
                  {strength.label}
                  {strength.label === 'Very Strong' && ' ✓'}
                </p>
              </div>
            )}

            {/* Confirm password (setup only) */}
            {isSetup && (
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  placeholder="Confirm password"
                  value={confirm}
                  onChange={e => { setConfirm(e.target.value); setError('') }}
                  disabled={loading}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                />
                {confirm && password && (
                  <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold ${confirm === password ? 'text-green-500' : 'text-red-400'}`}>
                    {confirm === password ? '✓' : '✗'}
                  </span>
                )}
              </div>
            )}

            {/* Attempts warning */}
            {showAttemptsWarning && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-yellow-50 border border-yellow-200">
                <span className="text-yellow-600 text-sm mt-px">⚠</span>
                <p className="text-xs text-yellow-800 font-medium">
                  {remainingAttempts > 0
                    ? `${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining before lockout`
                    : 'Next wrong attempt will trigger a lockout'}
                </p>
              </div>
            )}

            {/* Lockout banner */}
            {lockoutSec > 0 && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-red-500 shrink-0">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <p className="text-sm font-semibold text-red-700">
                  Too many attempts — try again in {lockoutSec}s
                </p>
              </div>
            )}

            {/* Error */}
            {error && lockoutSec === 0 && (
              <p className="text-sm text-red-500 text-center font-medium">{error}</p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={lockoutSec > 0 || loading || !password.trim() || (isSetup && !confirm.trim())}
              className="w-full py-3 rounded-xl text-white text-sm font-bold transition-opacity disabled:opacity-40"
              style={{ backgroundColor: '#6C63FF' }}
            >
              {loading
                ? 'Verifying…'
                : isSetup
                  ? 'Set Password & Enter App'
                  : 'Unlock WealthLens'}
            </button>
          </form>
        </div>

        {/* Footer note */}
        <p className="text-center text-xs mt-5" style={{ color: 'rgba(255,255,255,0.25)' }}>
          {isSetup
            ? 'Password encrypted with PBKDF2 + OS Keychain (safeStorage)'
            : 'Protected with PBKDF2-HMAC-SHA256 · 600k iterations'}
        </p>
      </div>
    </div>
  )
}
