import { useState, useEffect } from 'react'
import AppLogoIcon from './AppLogoIcon'

function PINKeypad({ user, onSuccess, onCancel }) {
  const [pin, setPin]             = useState('')
  const [error, setError]         = useState('')
  const [shake, setShake]         = useState(false)
  const [attempts, setAttempts]   = useState(0)
  const [lockout, setLockout]     = useState(0)   // timestamp when lockout ends
  const [countdown, setCountdown] = useState(0)

  // Countdown timer
  useEffect(() => {
    if (!lockout) return
    const tick = setInterval(() => {
      const remaining = Math.ceil((lockout - Date.now()) / 1000)
      if (remaining <= 0) { setLockout(0); setCountdown(0); setAttempts(0); clearInterval(tick) }
      else setCountdown(remaining)
    }, 500)
    return () => clearInterval(tick)
  }, [lockout])

  async function submitPin(p) {
    if (lockout && Date.now() < lockout) return
    const result = await window.electronAPI.verifyUserPin({ userId: user.id, pin: p })
    if (result.success) {
      onSuccess(result.user)
    } else {
      const newAttempts = attempts + 1
      setAttempts(newAttempts)
      setPin('')
      setShake(true)
      setTimeout(() => setShake(false), 600)
      if (newAttempts >= 3) {
        setLockout(Date.now() + 30_000)
        setCountdown(30)
        setError('Too many attempts. Wait 30 seconds.')
      } else {
        setError(`Wrong PIN. ${3 - newAttempts} attempt${3 - newAttempts !== 1 ? 's' : ''} remaining.`)
      }
    }
  }

  function pressKey(key) {
    if (lockout && Date.now() < lockout) return
    if (pin.length >= 6) return
    const newPin = pin + key
    setPin(newPin)
    setError('')
    if (newPin.length >= 4) {
      submitPin(newPin)
    }
  }

  function backspace() {
    setPin(p => p.slice(0, -1))
    setError('')
  }

  const dotCount = Math.max(4, pin.length)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: '#0f0f1a' }}>
      <div className="flex flex-col items-center" style={{ width: 320 }}>
        {/* Avatar */}
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-white mb-3 shadow-lg"
          style={{ backgroundColor: user.avatar_color }}>
          {user.name.charAt(0).toUpperCase()}
        </div>
        <p className="text-white font-semibold text-lg mb-1">{user.name}</p>
        <p className="text-gray-400 text-sm mb-8">Enter your PIN</p>

        {/* PIN dots */}
        <div className="flex gap-4 mb-6"
          style={{ animation: shake ? 'shake 0.5s ease' : 'none' }}>
          {Array.from({ length: dotCount }).map((_, i) => (
            <div key={i} className="w-4 h-4 rounded-full border-2 transition-all duration-150"
              style={{
                backgroundColor: i < pin.length ? 'white' : 'transparent',
                borderColor: i < pin.length ? 'white' : 'rgba(255,255,255,0.3)',
              }} />
          ))}
        </div>

        {/* Error / countdown */}
        {lockout && Date.now() < lockout ? (
          <p className="text-red-400 text-sm mb-4 text-center">
            Locked. Try again in {countdown}s
          </p>
        ) : error ? (
          <p className="text-red-400 text-sm mb-4 text-center">{error}</p>
        ) : (
          <div className="mb-4 h-5" />
        )}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3 w-full">
          {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((k, i) => {
            if (k === '') return <div key={i} />
            const isBack = k === '⌫'
            return (
              <button
                key={i}
                onClick={() => isBack ? backspace() : pressKey(String(k))}
                disabled={Boolean(lockout && Date.now() < lockout)}
                className="h-16 rounded-2xl text-xl font-semibold transition-all duration-100 active:scale-95 disabled:opacity-30"
                style={{
                  backgroundColor: isBack ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.1)',
                  color: 'white',
                }}
                onMouseEnter={e => { if (!isBack) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.18)' }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = isBack ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.1)' }}
              >
                {k}
              </button>
            )
          })}
        </div>

        <button onClick={onCancel} className="mt-8 text-sm text-gray-500 hover:text-gray-300 transition-colors">
          Back to profiles
        </button>
      </div>

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

export default function ProfileSelector({ onSignIn }) {
  const [users, setUsers]               = useState([])
  const [selectedUser, setSelectedUser] = useState(null)

  useEffect(() => {
    window.electronAPI.getUsers().then(setUsers).catch(() => {})
  }, [])

  if (selectedUser) {
    return (
      <PINKeypad
        user={selectedUser}
        onSuccess={onSignIn}
        onCancel={() => setSelectedUser(null)}
      />
    )
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center"
      style={{ backgroundColor: '#0f0f1a' }}>
      {/* Logo */}
      <div className="flex items-center gap-3 mb-3">
        <AppLogoIcon size={44} />
        <span className="text-white font-bold text-2xl tracking-tight">WealthLens</span>
      </div>
      <p className="text-gray-400 text-sm mb-14">Your personal wealth companion</p>

      {/* Profile cards */}
      <div className="flex gap-8">
        {users.map(user => (
          <button
            key={user.id}
            onClick={() => setSelectedUser(user)}
            className="flex flex-col items-center gap-3 p-6 rounded-3xl border transition-all duration-200 group"
            style={{
              backgroundColor: 'rgba(255,255,255,0.05)',
              borderColor: 'rgba(255,255,255,0.1)',
              width: 180,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'
              e.currentTarget.style.borderColor = user.avatar_color
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
            }}
          >
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-bold text-white shadow-lg transition-transform duration-200 group-hover:scale-105"
              style={{ backgroundColor: user.avatar_color }}>
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="text-center">
              <p className="text-white font-semibold text-base">{user.name}</p>
              <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                user.role === 'admin'
                  ? 'bg-indigo-500/20 text-indigo-300'
                  : 'bg-pink-500/20 text-pink-300'
              }`}>
                {user.role === 'admin' ? 'Admin' : 'Tracker'}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
