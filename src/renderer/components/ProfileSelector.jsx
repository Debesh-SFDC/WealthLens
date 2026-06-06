import { useState, useEffect, useRef } from 'react'
import AppLogoIcon from './AppLogoIcon'

const PIN_LENGTH = 6

export default function ProfileSelector({ onSignIn }) {
  const [pin, setPin]             = useState('')
  const [error, setError]         = useState('')
  const [shake, setShake]         = useState(false)
  const [attempts, setAttempts]   = useState(0)
  const [lockout, setLockout]     = useState(0)
  const [countdown, setCountdown] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  // Refs so the keyboard listener never goes stale
  const pinRef        = useRef('')
  const attemptsRef   = useRef(0)
  const lockoutRef    = useRef(0)
  const submittingRef = useRef(false)

  useEffect(() => { pinRef.current = pin },           [pin])
  useEffect(() => { attemptsRef.current = attempts }, [attempts])
  useEffect(() => { lockoutRef.current = lockout },   [lockout])

  // Lockout countdown
  useEffect(() => {
    if (!lockout) return
    const tick = setInterval(() => {
      const remaining = Math.ceil((lockout - Date.now()) / 1000)
      if (remaining <= 0) {
        setLockout(0); setCountdown(0); setAttempts(0)
        attemptsRef.current = 0; lockoutRef.current = 0
        clearInterval(tick)
      } else {
        setCountdown(remaining)
      }
    }, 500)
    return () => clearInterval(tick)
  }, [lockout])

  async function submitPin(p) {
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    try {
      const result = await window.electronAPI.verifyAnyPin(p)
      if (result.success) {
        onSignIn(result.user)
        return
      }
    } catch {}
    // Wrong PIN
    const newAttempts = attemptsRef.current + 1
    attemptsRef.current = newAttempts
    setAttempts(newAttempts)
    pinRef.current = ''
    setPin('')
    setShake(true)
    setTimeout(() => setShake(false), 600)
    if (newAttempts >= 5) {
      const until = Date.now() + 60_000
      lockoutRef.current = until
      setLockout(until)
      setCountdown(60)
      setError('Too many attempts. Wait 60 seconds.')
    } else {
      setError(`Wrong PIN. ${5 - newAttempts} attempt${5 - newAttempts !== 1 ? 's' : ''} remaining.`)
    }
    submittingRef.current = false
    setSubmitting(false)
  }

  function addDigit(key) {
    if (lockoutRef.current && Date.now() < lockoutRef.current) return
    if (submittingRef.current) return
    if (pinRef.current.length >= PIN_LENGTH) return
    const newPin = pinRef.current + key
    pinRef.current = newPin
    setPin(newPin)
    setError('')
    if (newPin.length === PIN_LENGTH) submitPin(newPin)
  }

  function removeDigit() {
    if (submittingRef.current) return
    const newPin = pinRef.current.slice(0, -1)
    pinRef.current = newPin
    setPin(newPin)
    setError('')
  }

  // Keyboard support — attached once, reads from refs
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key >= '0' && e.key <= '9') addDigit(e.key)
      else if (e.key === 'Backspace') removeDigit()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const isLocked = lockout && Date.now() < lockout

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center"
      style={{ backgroundColor: '#0f0f1a' }}>
      {/* Logo */}
      <div className="flex items-center gap-3 mb-2">
        <AppLogoIcon size={44} />
        <span className="text-white font-bold text-2xl tracking-tight">WealthLens</span>
      </div>
      <p className="text-gray-500 text-sm mb-12">Enter your PIN to continue</p>

      {/* PIN dots */}
      <div className="flex gap-4 mb-5"
        style={{ animation: shake ? 'shake 0.5s ease' : 'none' }}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <div key={i} className="w-4 h-4 rounded-full border-2 transition-all duration-150"
            style={{
              backgroundColor: submitting && i < pin.length
                ? '#6C63FF'
                : i < pin.length ? 'white' : 'transparent',
              borderColor: submitting && i < pin.length
                ? '#6C63FF'
                : i < pin.length ? 'white' : 'rgba(255,255,255,0.25)',
            }} />
        ))}
      </div>

      {/* Status */}
      <div className="h-6 mb-4 flex items-center justify-center">
        {submitting ? (
          <p className="text-gray-400 text-sm text-center">Verifying…</p>
        ) : isLocked ? (
          <p className="text-red-400 text-sm text-center">Locked. Try again in {countdown}s</p>
        ) : error ? (
          <p className="text-red-400 text-sm text-center">{error}</p>
        ) : null}
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-3" style={{ width: 272 }}>
        {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((k, i) => {
          if (k === '') return <div key={i} />
          const isBack = k === '⌫'
          return (
            <button
              key={i}
              onClick={() => isBack ? removeDigit() : addDigit(String(k))}
              disabled={Boolean(isLocked) || submitting}
              className="h-16 rounded-2xl text-xl font-semibold transition-all duration-100 active:scale-95 disabled:opacity-30"
              style={{
                backgroundColor: isBack ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.1)',
                color: 'white',
              }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = isBack ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.18)' }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = isBack ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.1)' }}
            >
              {k}
            </button>
          )
        })}
      </div>

      <p className="mt-8 text-xs text-gray-600">You can also type your PIN using the keyboard</p>

      <style>{`
        @keyframes shake {
          0%,100% { transform: translateX(0) }
          20%      { transform: translateX(-8px) }
          40%      { transform: translateX(8px) }
          60%      { transform: translateX(-6px) }
          80%      { transform: translateX(6px) }
        }
      `}</style>
    </div>
  )
}
