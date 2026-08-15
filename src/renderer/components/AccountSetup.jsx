import { useState } from 'react'
import bridge from '../lib/bridge'
import AppLogoIcon from './AppLogoIcon'

const IS_ELECTRON = typeof window !== 'undefined' && window.electronAPI !== undefined
const STEPS = ['Your Account', 'Family Member', 'Done']

function validMobile(m) { return /^\d{10}$/.test(m) }
function validPassword(p) { return p.length >= 6 }

export default function AccountSetup({ onComplete }) {
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [adminUser, setAdminUser] = useState(null)

  // Step 0 — admin
  const [name, setName]         = useState('')
  const [mobile, setMobile]     = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')

  // Step 1 — optional tracker
  const [tName, setTName]         = useState('')
  const [tMobile, setTMobile]     = useState('')
  const [tPassword, setTPassword] = useState('')
  const [tConfirm, setTConfirm]   = useState('')

  const step0Valid = name.trim() && validMobile(mobile) && validPassword(password) && password === confirm

  async function handleCreateAdmin() {
    if (!step0Valid) return
    setError('')
    setSaving(true)
    try {
      const result = await bridge.bootstrap({ name: name.trim(), mobile_number: mobile, password })
      if (IS_ELECTRON) {
        if (!result?.success) { setError(result?.error || 'Could not create account'); return }
        setAdminUser(result.user)
      } else {
        localStorage.setItem('wealthlens_token', result.token)
        setAdminUser(result.user)
      }
      setStep(1)
    } catch (err) {
      setError(err.message || 'Could not create account')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddTracker(save) {
    if (!save) { setStep(2); return }
    if (!tName.trim() || !validMobile(tMobile) || !validPassword(tPassword) || tPassword !== tConfirm) return
    setError('')
    setSaving(true)
    try {
      await bridge.createUser({ name: tName.trim(), role: 'tracker', mobile_number: tMobile, password: tPassword })
      setStep(2)
    } catch (err) {
      setError(err.message || 'Could not add family member')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: '#1a1a2e' }}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-3 justify-center mb-8">
          <AppLogoIcon size={40} />
          <span className="text-white font-bold text-xl tracking-tight">WealthLens</span>
        </div>

        <div className="flex items-center px-4 mb-8">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center flex-1 last:flex-none">
              <div className="flex items-center gap-2 shrink-0">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors"
                  style={{
                    backgroundColor: i < step ? '#22C55E' : i === step ? '#6C63FF' : 'rgba(255,255,255,0.1)',
                    color: i <= step ? '#fff' : 'rgba(255,255,255,0.4)',
                  }}
                >
                  {i < step ? '✓' : i + 1}
                </div>
                <span className="text-xs font-medium" style={{ color: i === step ? '#fff' : 'rgba(255,255,255,0.35)' }}>{s}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className="flex-1 mx-3 h-px" style={{ backgroundColor: i < step ? '#22C55E' : 'rgba(255,255,255,0.1)' }} />
              )}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-2xl mx-4">
          {/* ── Step 0: Admin account ── */}
          {step === 0 && (
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Welcome to WealthLens 👋</h2>
              <p className="text-sm text-gray-500 mb-6">Let's create your account first.</p>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Your Name *</label>
                  <input
                    autoFocus type="text" placeholder="e.g. Rahul Sharma"
                    value={name} onChange={e => setName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base font-medium text-gray-900 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Mobile Number *</label>
                  <input
                    type="tel" inputMode="numeric" placeholder="9000000001"
                    value={mobile} onChange={e => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base font-medium text-gray-900 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Password *</label>
                    <input
                      type="password" placeholder="6+ characters"
                      value={password} onChange={e => setPassword(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base font-medium text-gray-900 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Confirm *</label>
                    <input
                      type="password" placeholder="Repeat password"
                      value={confirm} onChange={e => setConfirm(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base font-medium text-gray-900 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                    />
                  </div>
                </div>
              </div>

              {error && <p className="text-sm font-medium text-red-500 mb-4">{error}</p>}

              <button
                onClick={handleCreateAdmin}
                disabled={!step0Valid || saving}
                className="w-full py-3 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
                style={{ backgroundColor: '#6C63FF' }}
              >
                {saving ? 'Creating…' : 'Continue →'}
              </button>
            </>
          )}

          {/* ── Step 1: Optional tracker ── */}
          {step === 1 && (
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Add a Family Member 👨‍👩‍👧</h2>
              <p className="text-sm text-gray-500 mb-6">Optional — they can log expenses without seeing your full financial picture. You can skip this and add them later.</p>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Name</label>
                  <input
                    type="text" placeholder="e.g. Spouse"
                    value={tName} onChange={e => setTName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-900 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Mobile Number</label>
                  <input
                    type="tel" inputMode="numeric" placeholder="9000000002"
                    value={tMobile} onChange={e => setTMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-900 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Password</label>
                    <input
                      type="password" placeholder="6+ characters"
                      value={tPassword} onChange={e => setTPassword(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-900 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Confirm</label>
                    <input
                      type="password" placeholder="Repeat password"
                      value={tConfirm} onChange={e => setTConfirm(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-900 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                    />
                  </div>
                </div>
              </div>

              {error && <p className="text-sm font-medium text-red-500 mb-4">{error}</p>}

              <div className="flex gap-3">
                <button onClick={() => handleAddTracker(false)} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                  Skip for now
                </button>
                <button
                  onClick={() => handleAddTracker(true)}
                  disabled={!tName.trim() || !validMobile(tMobile) || !validPassword(tPassword) || tPassword !== tConfirm || saving}
                  className="flex-1 py-3 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
                  style={{ backgroundColor: '#6C63FF' }}
                >
                  {saving ? 'Adding…' : 'Add →'}
                </button>
              </div>
            </>
          )}

          {/* ── Step 2: Done ── */}
          {step === 2 && (
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-1">You're all set 🎉</h2>
              <p className="text-sm text-gray-500 mb-6">Your account is ready.</p>

              <button
                onClick={() => onComplete(adminUser)}
                className="w-full py-3 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                style={{ backgroundColor: '#6C63FF' }}
              >
                Get Started 🚀
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
