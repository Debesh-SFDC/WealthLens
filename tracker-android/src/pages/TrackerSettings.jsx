import { useState, useEffect } from 'react'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { getTrackerBudget, setTrackerBudget, getUserName, setUserName, setPin, getAllExpenses, getWeightLogs, getWeightProfile, saveWeightProfile } from '../db/index.js'

export default function TrackerSettings({ onLock }) {
  const [budget, setBudgetVal] = useState('')
  const [name, setName]        = useState('')
  const [newPin, setNewPin]    = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinMsg, setPinMsg]    = useState('')
  const [saved, setSaved]      = useState({})
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState('')
  const [height, setHeight]    = useState('')
  const [dob, setDob]          = useState('')

  useEffect(() => {
    getTrackerBudget().then(b => setBudgetVal(b ? String(b) : ''))
    getUserName().then(n => setName(n === 'You' ? '' : n))
    getWeightProfile().then(p => {
      if (p?.heightCm) setHeight(String(p.heightCm))
      if (p?.dateOfBirth) setDob(p.dateOfBirth)
    }).catch(() => {})
  }, [])

  function flash(key) {
    setSaved(s => ({ ...s, [key]: true }))
    setTimeout(() => setSaved(s => ({ ...s, [key]: false })), 1800)
  }

  async function saveBudget() {
    const amt = parseFloat(budget)
    if (isNaN(amt) || amt < 0) return
    await setTrackerBudget(amt)
    flash('budget')
  }

  async function saveName() {
    const n = name.trim() || 'You'
    await setUserName(n)
    flash('name')
  }

  async function saveProfile() {
    const h = parseFloat(height)
    if (!isNaN(h) && h > 0) {
      await saveWeightProfile({ heightCm: h, dateOfBirth: dob || undefined })
      flash('profile')
    }
  }

  async function changePin() {
    if (newPin.length !== 6 || newPin !== confirmPin) {
      setPinMsg(newPin.length !== 6 ? 'PIN must be 6 digits' : 'PINs do not match')
      return
    }
    await setPin(newPin)
    setNewPin('')
    setConfirmPin('')
    setPinMsg('PIN updated!')
    setTimeout(() => setPinMsg(''), 2000)
  }

  async function doExport() {
    setExporting(true)
    setExportMsg('')
    try {
      const [expenses, weightLogs] = await Promise.all([
        getAllExpenses({}),
        getWeightLogs({}),
      ])
      const payload = {
        exported_at: new Date().toISOString(),
        version: 1,
        expenses,
        weight_logs: weightLogs,
      }
      const json     = JSON.stringify(payload, null, 2)
      const fileName = `wealthlens-${new Date().toISOString().split('T')[0]}.json`

      await Filesystem.writeFile({
        path: fileName,
        data: json,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      })
      const { uri } = await Filesystem.getUri({ directory: Directory.Cache, path: fileName })

      await Share.share({
        title: 'WealthLens Data Export',
        url: uri,
        dialogTitle: 'Share with WealthLens desktop',
      })
      setExportMsg(`Exported ${expenses.length} expenses + ${weightLogs.length} weight logs`)
    } catch (e) {
      setExportMsg('Export failed: ' + e.message)
    } finally { setExporting(false) }
  }

  return (
    <div className="pb-24 px-4 pt-5" style={{ minHeight: '100vh', background: '#F8F9FF' }}>
      <style>{`@keyframes fadeInUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`}</style>

      <p className="text-xl font-extrabold text-gray-900 mb-5" style={{ animation: 'fadeInUp 0.3s ease' }}>Settings</p>

      {/* Profile */}
      <div className="bg-white rounded-3xl p-4 mb-4 shadow-sm" style={{ animation: 'fadeInUp 0.3s ease 40ms both' }}>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Profile</p>
        <div className="flex flex-col gap-2">
          <div className="flex gap-3">
            <input
              type="text" placeholder="Your name"
              value={name} onChange={e => setName(e.target.value)}
              className="flex-1 px-4 py-3 rounded-2xl text-sm text-gray-800 outline-none"
              style={{ backgroundColor: '#F9FAFB', border: '2px solid transparent' }}
            />
            <button onClick={saveName}
              className="px-5 py-3 rounded-2xl text-white text-sm font-bold"
              style={{ background: saved.name ? 'linear-gradient(135deg,#10B981,#059669)' : 'linear-gradient(135deg,#6C63FF,#4338CA)' }}>
              {saved.name ? '✓' : 'Save'}
            </button>
          </div>
          <div className="flex items-center gap-2 px-4 py-3 rounded-2xl" style={{ backgroundColor: '#F9FAFB' }}>
            <span className="text-xs font-semibold text-gray-500 w-20">Height (cm)</span>
            <input
              type="number" placeholder="e.g. 170" min="50" max="250"
              value={height} onChange={e => setHeight(e.target.value)}
              className="flex-1 text-sm font-bold text-gray-900 bg-transparent outline-none"
            />
          </div>
          <div className="flex items-center gap-2 px-4 py-3 rounded-2xl" style={{ backgroundColor: '#F9FAFB' }}>
            <span className="text-xs font-semibold text-gray-500 w-20">Date of Birth</span>
            <input
              type="date" value={dob} onChange={e => setDob(e.target.value)}
              className="flex-1 text-sm font-bold text-gray-900 bg-transparent outline-none"
            />
          </div>
          <button onClick={saveProfile} disabled={!height}
            className="w-full py-3 rounded-2xl text-white text-sm font-bold disabled:opacity-40"
            style={{ background: saved.profile ? 'linear-gradient(135deg,#10B981,#059669)' : 'linear-gradient(135deg,#6C63FF,#4338CA)' }}>
            {saved.profile ? '✓ Profile Saved' : 'Save Profile'}
          </button>
        </div>
      </div>

      {/* Budget */}
      <div className="bg-white rounded-3xl p-4 mb-4 shadow-sm" style={{ animation: 'fadeInUp 0.3s ease 80ms both' }}>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Monthly Budget</p>
        <div className="flex gap-3">
          <div className="flex items-center gap-2 flex-1 px-4 py-3 rounded-2xl" style={{ backgroundColor: '#F9FAFB' }}>
            <span className="font-bold text-purple-500">₹</span>
            <input
              type="number" placeholder="0" min="0"
              value={budget} onChange={e => setBudgetVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveBudget() }}
              className="flex-1 text-sm font-bold text-gray-900 bg-transparent outline-none"
            />
          </div>
          <button onClick={saveBudget}
            className="px-5 py-3 rounded-2xl text-white text-sm font-bold"
            style={{ background: saved.budget ? 'linear-gradient(135deg,#10B981,#059669)' : 'linear-gradient(135deg,#6C63FF,#4338CA)' }}>
            {saved.budget ? '✓' : 'Save'}
          </button>
        </div>
      </div>

      {/* PIN */}
      <div className="bg-white rounded-3xl p-4 mb-4 shadow-sm" style={{ animation: 'fadeInUp 0.3s ease 120ms both' }}>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Change PIN</p>
        <div className="flex flex-col gap-2">
          <input
            type="password" placeholder="New 6-digit PIN" maxLength={6}
            value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g,'').slice(0,6))}
            className="w-full px-4 py-3 rounded-2xl text-sm text-gray-800 outline-none"
            style={{ backgroundColor: '#F9FAFB', border: '2px solid transparent', letterSpacing: '0.3em' }}
          />
          <input
            type="password" placeholder="Confirm new PIN" maxLength={6}
            value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g,'').slice(0,6))}
            className="w-full px-4 py-3 rounded-2xl text-sm text-gray-800 outline-none"
            style={{ backgroundColor: '#F9FAFB', border: '2px solid transparent', letterSpacing: '0.3em' }}
          />
          {pinMsg && (
            <p className="text-xs font-semibold" style={{ color: pinMsg.includes('updated') ? '#10B981' : '#EF4444' }}>{pinMsg}</p>
          )}
          <button onClick={changePin} disabled={!newPin || !confirmPin}
            className="w-full py-3 rounded-2xl text-white text-sm font-bold disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg,#6C63FF,#4338CA)' }}>
            Update PIN
          </button>
        </div>
      </div>

      {/* Export Data */}
      <div className="bg-white rounded-3xl p-4 mb-4 shadow-sm" style={{ animation: 'fadeInUp 0.3s ease 160ms both' }}>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Sync with Desktop</p>
        <p className="text-xs text-gray-400 mb-4">Export your data and share the file with the WealthLens desktop app to sync expenses and weight logs.</p>
        {exportMsg && (
          <p className="text-xs font-semibold mb-3" style={{ color: exportMsg.includes('failed') ? '#EF4444' : '#10B981' }}>{exportMsg}</p>
        )}
        <button onClick={doExport} disabled={exporting}
          className="w-full py-3.5 rounded-2xl text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg,#6C63FF,#4338CA)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
            <polyline points="16 6 12 2 8 6"/>
            <line x1="12" y1="2" x2="12" y2="15"/>
          </svg>
          {exporting ? 'Preparing…' : 'Export & Share Data'}
        </button>
      </div>

      {/* Lock */}
      <button onClick={onLock}
        className="w-full flex items-center justify-center gap-2 py-4 rounded-3xl text-sm font-bold shadow-sm"
        style={{ backgroundColor: 'white', color: '#6B7280', animation: 'fadeInUp 0.3s ease 200ms both' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        Lock App
      </button>
    </div>
  )
}
