import { useState, useRef } from 'react'
import { verifyPin, setPin } from '../db/index.js'

const PIN_LENGTH = 6

export default function PinLock({ onUnlock, isFirstTime = false }) {
  const [pin, setP]         = useState('')
  const [confirm, setConfirm] = useState('')
  const [step, setStep]     = useState(isFirstTime ? 'set' : 'enter') // 'set' | 'confirm' | 'enter'
  const [error, setError]   = useState('')
  const [shake, setShake]   = useState(false)
  const [checking, setChecking] = useState(false)
  const pinRef = useRef('')

  const displayPin = step === 'confirm' ? confirm : pin

  function triggerShake(msg) {
    setError(msg)
    setShake(true)
    setTimeout(() => setShake(false), 500)
  }

  async function addDigit(d) {
    if (checking) return
    if (step === 'confirm') {
      const next = confirm + d
      if (next.length > PIN_LENGTH) return
      setConfirm(next)
      if (next.length === PIN_LENGTH) {
        if (next === pinRef.current) {
          await setPin(next)
          onUnlock()
        } else {
          setConfirm('')
          triggerShake('PINs do not match — try again')
        }
      }
      return
    }

    const next = pin + d
    if (next.length > PIN_LENGTH) return
    setP(next)
    pinRef.current = next

    if (next.length === PIN_LENGTH) {
      if (step === 'set') {
        setStep('confirm')
        setError('')
      } else {
        setChecking(true)
        const ok = await verifyPin(next)
        setChecking(false)
        if (ok) {
          onUnlock()
        } else {
          setP('')
          pinRef.current = ''
          triggerShake('Wrong PIN')
        }
      }
    }
  }

  function removeDigit() {
    if (step === 'confirm') {
      setConfirm(v => v.slice(0, -1))
    } else {
      const next = pin.slice(0, -1)
      setP(next)
      pinRef.current = next
    }
    setError('')
  }

  const title = step === 'set' ? 'Create your PIN' : step === 'confirm' ? 'Confirm your PIN' : 'Enter PIN'
  const subtitle = step === 'set'
    ? 'Choose a 6-digit PIN to protect your data'
    : step === 'confirm'
    ? 'Enter the same PIN again'
    : 'WealthLens Tracker'

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-8"
      style={{ background: 'linear-gradient(160deg, #0D0B26 0%, #1E1A6E 100%)' }}>

      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          20%{transform:translateX(-8px)}
          40%{transform:translateX(8px)}
          60%{transform:translateX(-6px)}
          80%{transform:translateX(6px)}
        }
        .shake { animation: shake 0.4s ease; }
        @keyframes dotPop {
          0%{transform:scale(1)}50%{transform:scale(1.3)}100%{transform:scale(1)}
        }
        .dot-filled { animation: dotPop 0.15s ease; }
      `}</style>

      {/* Logo */}
      <div className="mb-8 flex flex-col items-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: 'linear-gradient(135deg, #6C63FF, #4338CA)', boxShadow: '0 8px 32px rgba(108,99,255,0.4)' }}>
          <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
            <circle cx="18" cy="18" r="10" stroke="#FFD700" strokeWidth="2.5"/>
            <line x1="25" y1="25" x2="34" y2="34" stroke="#FFD700" strokeWidth="2.5" strokeLinecap="round"/>
            <polyline points="12,20 16,15 20,18 24,12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
        </div>
        <p className="text-white text-xl font-extrabold tracking-tight">WealthLens</p>
        <p className="text-white/50 text-sm font-medium">Tracker</p>
      </div>

      <p className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-1">{subtitle}</p>
      <p className="text-white text-xl font-bold mb-8">{title}</p>

      {/* PIN dots */}
      <div className={`flex gap-4 mb-2 ${shake ? 'shake' : ''}`}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => {
          const filled = i < displayPin.length
          return (
            <div
              key={i}
              className={filled ? 'dot-filled' : ''}
              style={{
                width: 16, height: 16, borderRadius: '50%',
                backgroundColor: filled ? '#6C63FF' : 'transparent',
                border: `2px solid ${filled ? '#6C63FF' : 'rgba(255,255,255,0.3)'}`,
                boxShadow: filled ? '0 0 10px rgba(108,99,255,0.6)' : 'none',
                transition: 'all 0.15s ease',
              }}
            />
          )
        })}
      </div>

      {error ? (
        <p className="text-red-400 text-xs font-semibold mb-8 mt-2">{error}</p>
      ) : (
        <div className="mb-8 mt-2" style={{ height: 20 }} />
      )}

      {/* Keypad */}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(3, 72px)' }}>
        {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((key, i) => {
          if (key === '') return <div key={i} />
          const isBack = key === '⌫'
          return (
            <button
              key={key}
              onPointerDown={() => isBack ? removeDigit() : addDigit(key)}
              className="flex items-center justify-center rounded-2xl text-white font-bold select-none"
              style={{
                height: 72,
                fontSize: isBack ? 22 : 26,
                backgroundColor: isBack ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.1)',
                WebkitUserSelect: 'none',
                active: { backgroundColor: 'rgba(255,255,255,0.2)' },
              }}
            >
              {key}
            </button>
          )
        })}
      </div>

      {step === 'enter' && (
        <p className="text-white/30 text-xs mt-8">Default PIN: 000000</p>
      )}
    </div>
  )
}
