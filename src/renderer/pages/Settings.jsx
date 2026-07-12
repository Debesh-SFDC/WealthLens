import { useState, useEffect } from 'react'

const fmtDate = (s) =>
  s ? new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
const fmtBytes = (b) =>
  b ? (Number(b) > 1024 * 1024 ? `${(Number(b) / 1024 / 1024).toFixed(1)} MB` : `${(Number(b) / 1024).toFixed(0)} KB`) : ''
const fmt = v => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0)

const AVATAR_COLORS = ['#6C63FF', '#EC4899', '#10B981', '#F59E0B', '#EF4444', '#3B82F6']

function ImportPhoneButton() {
  const [result, setResult] = useState(null)
  const [importing, setImporting] = useState(false)
  const [users, setUsers] = useState([])
  const [targetUserId, setTargetUserId] = useState('')

  useEffect(() => {
    window.electronAPI.getUsers().then(us => {
      if (us?.length) {
        setUsers(us)
        const tracker = us.find(u => u.role === 'tracker') || us[0]
        setTargetUserId(String(tracker.id))
      }
    }).catch(() => {})
  }, [])

  async function pick() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = e.target.files[0]
      if (!file) return
      setImporting(true)
      setResult(null)
      try {
        const uid = targetUserId ? parseInt(targetUserId) : undefined
        const r = await window.electronAPI.importPhoneData(file.path, uid)
        setResult({ ok: true, msg: `Imported ${r.expensesImported} expenses + ${r.weightImported} weight logs` })
      } catch (err) {
        setResult({ ok: false, msg: err.message || 'Import failed' })
      } finally { setImporting(false) }
    }
    input.click()
  }

  return (
    <div className="space-y-3">
      {users.length > 0 && (
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Import data for</label>
          <select
            value={targetUserId}
            onChange={e => setTargetUserId(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20 bg-white"
          >
            {users.map(u => (
              <option key={u.id} value={String(u.id)}>
                {u.name} ({u.role === 'admin' ? 'Admin' : 'Tracker'})
              </option>
            ))}
          </select>
        </div>
      )}
      <button
        onClick={pick}
        disabled={importing}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
        style={{ backgroundColor: '#6C63FF' }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        {importing ? 'Importing…' : 'Select JSON File'}
      </button>
      {result && (
        <p className={`text-sm font-medium ${result.ok ? 'text-green-600' : 'text-red-500'}`}>
          {result.ok ? '✓ ' : '✗ '}{result.msg}
        </p>
      )}
    </div>
  )
}

export default function Settings({ onSyncRefresh }) {
  // Profile
  const [profileForm, setProfileForm] = useState({ name: '', monthly_salary: '', date_of_birth: '', retirement_age: '60' })
  const [profileSaved, setProfileSaved] = useState(false)

  // Security
  const [pwForm, setPwForm]         = useState({ current: '', next: '', confirm: '' })
  const [showPw, setShowPw]         = useState(false)
  const [pwStatus, setPwStatus]     = useState(null) // null | 'saving' | 'ok' | 'error'
  const [pwError, setPwError]       = useState('')
  const setPwField = (k, v) => { setPwForm(f => ({ ...f, [k]: v })); setPwError(''); setPwStatus(null) }

  function pwStrength(p) {
    if (!p) return null
    let s = 0
    if (p.length >= 8) s++
    if (p.length >= 12) s++
    if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++
    if (/[0-9]/.test(p)) s++
    if (/[^A-Za-z0-9]/.test(p)) s++
    const levels = [
      { label: 'Too Short',   color: '#9CA3AF', pct: 8   },
      { label: 'Weak',        color: '#EF4444', pct: 22  },
      { label: 'Fair',        color: '#F59E0B', pct: 45  },
      { label: 'Good',        color: '#3B82F6', pct: 65  },
      { label: 'Strong',      color: '#10B981', pct: 85  },
      { label: 'Very Strong', color: '#059669', pct: 100 },
    ]
    return levels[Math.min(s, 5)]
  }

  async function changePassword() {
    if (!pwForm.current.trim()) { setPwError('Enter your current password'); return }
    if (pwForm.next.length < 8) { setPwError('New password must be at least 8 characters'); return }
    const strength = pwStrength(pwForm.next)
    if (strength && ['Too Short', 'Weak', 'Fair'].includes(strength.label)) {
      setPwError('New password is too weak — use a mix of letters, numbers, symbols'); return
    }
    if (pwForm.next !== pwForm.confirm) { setPwError('New passwords do not match'); return }
    setPwStatus('saving')
    try {
      const r = await window.electronAPI.changeAppPassword({ currentPassword: pwForm.current, newPassword: pwForm.next })
      if (r.success) {
        setPwForm({ current: '', next: '', confirm: '' })
        setPwStatus('ok')
        showToast('Password changed successfully')
      } else {
        setPwError(r.error || 'Failed to change password')
        setPwStatus('error')
      }
    } catch {
      setPwError('An error occurred')
      setPwStatus('error')
    }
  }

  // Drive
  const [driveStatus, setDriveStatus] = useState({ connected: false, email: null, lastBackup: null })
  const [hasCreds, setHasCreds]       = useState(false)
  const [storedCreds, setStoredCreds] = useState(null)
  const [showCreds, setShowCreds]     = useState(false)
  const [credsForm, setCredsForm]     = useState({ clientId: '', clientSecret: '' })
  const [showCredsForm, setShowCredsForm] = useState(false)
  const [autoBackup, setAutoBackup]   = useState(false)
  const [backups, setBackups]         = useState([])
  const [loadingBackups, setLoadingBackups] = useState(false)
  const [driveOp, setDriveOp]         = useState(null)
  const [toast, setToast]             = useState(null)
  const [restoring, setRestoring]     = useState(false)

  // Row-level sync (all tables)
  const [deviceId, setDeviceId]       = useState('')
  const [syncLog, setSyncLog]         = useState([])
  const [syncing, setSyncing]         = useState(false)
  const [lastSyncResult, setLastSyncResult] = useState(null)

  // Browser picker
  const [showBrowserPicker, setShowBrowserPicker] = useState(false)
  const [browserList, setBrowserList]             = useState([])

  // Users
  const [users, setUsers]         = useState([])
  const [userForms, setUserForms] = useState({}) // { [id]: { name, avatar_color } }
  const [pinForms, setPinForms]   = useState({}) // { [id]: { newPin, confirmPin } }
  const [trackerBudget, setTrackerBudget] = useState('')
  const [trackerExpenseSummary, setTrackerExpenseSummary] = useState(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    try {
      const [profile, status, hasCr, creds, ab, loadedUsers, devId, log] = await Promise.all([
        window.electronAPI.getProfile(),
        window.electronAPI.getDriveStatus(),
        window.electronAPI.hasDriveCreds(),
        window.electronAPI.getDriveCredentials(),
        window.electronAPI.getDriveAutoBackup(),
        window.electronAPI.getUsers(),
        window.electronAPI.getDeviceId(),
        window.electronAPI.getSyncLog(),
      ])
      if (profile) setProfileForm({ name: profile.name || '', monthly_salary: profile.monthly_salary || '', date_of_birth: profile.date_of_birth || '', retirement_age: String(profile.retirement_age || 60) })
      setDriveStatus(status || { connected: false, email: null, lastBackup: null })
      setHasCreds(Boolean(hasCr))
      setStoredCreds(creds || null)
      setAutoBackup(Boolean(ab))
      setDeviceId(devId || '')
      setSyncLog(log || [])

      if (loadedUsers) {
        setUsers(loadedUsers)
        const forms = {}
        const pins = {}
        for (const u of loadedUsers) {
          forms[u.id] = { name: u.name, avatar_color: u.avatar_color || '#6C63FF' }
          pins[u.id]  = { newPin: '', confirmPin: '' }
        }
        setUserForms(forms)
        setPinForms(pins)
      }
    } catch (e) {
      // silent
    }

    try {
      const budget = await window.electronAPI.getTrackerBudget()
      setTrackerBudget(budget ? String(budget) : '')
    } catch {}

    // Load tracker expense summary for this month — use loadedUsers from the same call above
    try {
      const latestUsers = await window.electronAPI.getUsers()
      const now = new Date()
      const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const trackerUser = (latestUsers || []).find(u => u.role === 'tracker')
      if (trackerUser) {
        const exps = await window.electronAPI.getAllExpenses({ month: ym, logged_by: trackerUser.id })
        const total = exps.reduce((s, e) => s + e.amount, 0)
        setTrackerExpenseSummary({ total, count: exps.length })
      }
    } catch {}
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  async function saveProfile() {
    await window.electronAPI.saveProfile({
      name: profileForm.name,
      monthly_salary: parseFloat(profileForm.monthly_salary) || 0,
      date_of_birth: profileForm.date_of_birth || null,
      retirement_age: parseInt(profileForm.retirement_age) || 60,
    })
    setProfileSaved(true)
    setTimeout(() => setProfileSaved(false), 2000)
    showToast('Profile saved successfully')
  }

  async function saveCreds() {
    if (!credsForm.clientId.trim() || !credsForm.clientSecret.trim()) return
    await window.electronAPI.saveDriveCredentials(credsForm.clientId.trim(), credsForm.clientSecret.trim())
    setHasCreds(true)
    setStoredCreds({ clientId: credsForm.clientId.trim(), clientSecret: credsForm.clientSecret.trim() })
    setShowCredsForm(false)
    setCredsForm({ clientId: '', clientSecret: '' })
    showToast('Credentials saved')
  }

  async function connect() {
    if (!hasCreds) { setShowCredsForm(true); return }
    try {
      const browsers = await window.electronAPI.getInstalledBrowsers()
      setBrowserList(browsers)
      setShowBrowserPicker(true)
    } catch {
      connectWithBrowser(null)
    }
  }

  async function connectWithBrowser(browserApp) {
    setShowBrowserPicker(false)
    try {
      setDriveOp('connecting')
      const result = await window.electronAPI.connectDrive(browserApp)
      setDriveStatus({ connected: true, email: result.email, lastBackup: null })
      onSyncRefresh?.()
      showToast(`Connected as ${result.email}`)
    } catch (e) {
      showToast(e.message || 'Connection failed', 'error')
    } finally {
      setDriveOp(null)
    }
  }

  async function disconnect() {
    await window.electronAPI.disconnectDrive()
    setDriveStatus({ connected: false, email: null, lastBackup: null })
    setBackups([])
    onSyncRefresh?.()
    showToast('Disconnected from Google Drive')
  }

  async function backupNow() {
    try {
      setDriveOp('backing-up')
      const result = await window.electronAPI.driveBackupNow()
      setDriveStatus(s => ({ ...s, lastBackup: new Date().toISOString() }))
      onSyncRefresh?.()
      showToast(`Backup complete: ${result.name}`)
    } catch (e) {
      onSyncRefresh?.()
      showToast(e.message || 'Backup failed', 'error')
    } finally {
      setDriveOp(null)
    }
  }

  async function syncNow() {
    try {
      setSyncing(true)
      const result = await window.electronAPI.syncNow()
      setLastSyncResult(result)
      onSyncRefresh?.()
      const log = await window.electronAPI.getSyncLog()
      setSyncLog(log || [])
      if (result?.success) {
        setDriveStatus(s => ({ ...s, lastBackup: result.syncedAt }))
        showToast(`Synced! ${result.rowsUploaded} rows uploaded, ${result.rowsDownloaded} rows downloaded`)
      } else {
        showToast(result?.error || 'Sync failed', 'error')
      }
    } catch (e) {
      onSyncRefresh?.()
      showToast(e.message || 'Sync failed', 'error')
    } finally {
      setSyncing(false)
    }
  }

  async function loadBackups() {
    try {
      setLoadingBackups(true)
      const list = await window.electronAPI.listDriveBackups()
      setBackups(list || [])
    } catch (e) {
      showToast(e.message || 'Failed to load backups', 'error')
    } finally {
      setLoadingBackups(false)
    }
  }

  async function restore(fileId, fileName) {
    let lastChange = null
    try {
      lastChange = await window.electronAPI.getDriveDbLastModified()
    } catch {}

    const lastChangeStr = lastChange ? fmtDate(lastChange) : 'unknown'
    const confirmed = confirm(
      `Restore from "${fileName}"?\n\n` +
      `Warning: This will overwrite your local data.\n` +
      `Last local change was: ${lastChangeStr}\n\n` +
      `The app will restart automatically after restoring. Continue?`
    )
    if (!confirmed) return

    try {
      setRestoring(true)
      setDriveOp('restoring')
      showToast('Restoring… app will restart shortly.', 'success')
      await window.electronAPI.driveRestore(fileId)
    } catch (e) {
      setRestoring(false)
      setDriveOp(null)
      showToast(e.message || 'Restore failed', 'error')
    }
  }

  async function toggleAutoBackup(val) {
    setAutoBackup(val)
    await window.electronAPI.setDriveAutoBackup(val)
  }

  // ── User management helpers ───────────────────────────────────────────────

  function setUserField(id, key, val) {
    setUserForms(f => ({ ...f, [id]: { ...f[id], [key]: val } }))
  }

  function setPinField(id, key, val) {
    setPinForms(f => ({ ...f, [id]: { ...f[id], [key]: val } }))
  }

  async function saveUserProfile(user) {
    const form = userForms[user.id]
    if (!form?.name?.trim()) { showToast('Name cannot be empty', 'error'); return }
    await window.electronAPI.updateUserProfile({ id: user.id, name: form.name.trim(), avatar_color: form.avatar_color })
    showToast(`${user.role === 'admin' ? 'Admin' : 'Tracker'} profile saved`)
    loadAll()
  }

  async function saveUserPin(user) {
    const form = pinForms[user.id]
    if (!form?.newPin || form.newPin.length < 6) { showToast('PIN must be at least 6 digits', 'error'); return }
    if (!/^\d+$/.test(form.newPin)) { showToast('PIN must contain only digits', 'error'); return }
    if (form.newPin !== form.confirmPin) { showToast('PINs do not match', 'error'); return }
    await window.electronAPI.updateUserPin({ id: user.id, newPin: form.newPin })
    setPinForms(f => ({ ...f, [user.id]: { newPin: '', confirmPin: '' } }))
    showToast(`${user.role === 'admin' ? 'Admin' : 'Tracker'} PIN updated`)
  }

  async function saveTrackerBudget() {
    const amount = parseFloat(trackerBudget) || 0
    await window.electronAPI.setTrackerBudget(amount)
    showToast('Tracker budget saved')
  }

  const adminUser   = users.find(u => u.role === 'admin')
  const trackerUser = users.find(u => u.role === 'tracker')

  return (
    <div className="p-8 max-w-2xl">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-lg text-sm font-semibold text-white ${toast.type === 'error' ? 'bg-red-500' : 'bg-[#6C63FF]'}`}
        >
          {toast.type === 'error' ? '❌' : '✅'} {toast.msg}
        </div>
      )}

      {/* Browser picker modal */}
      {showBrowserPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowBrowserPicker(false) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-base font-bold text-gray-900">Open in browser</p>
              <p className="text-xs text-gray-400 mt-0.5">Choose which browser to use for Google sign-in</p>
            </div>
            <div className="py-2">
              {browserList.map(b => (
                <button
                  key={b.name}
                  onClick={() => connectWithBrowser(b.app)}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors text-left"
                >
                  <span className="text-xl w-7 text-center shrink-0">{b.icon}</span>
                  <span className="text-sm font-medium text-gray-800">{b.name}</span>
                  {b.app === null && (
                    <span className="ml-auto text-xs text-gray-400">default</span>
                  )}
                </button>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-gray-100">
              <button
                onClick={() => setShowBrowserPicker(false)}
                className="w-full py-2 text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore overlay */}
      {restoring && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-10 shadow-2xl flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl" style={{ backgroundColor: '#f0efff' }}>⏳</div>
            <p className="text-lg font-bold text-gray-900">Restoring…</p>
            <p className="text-sm text-gray-500 text-center">The app will restart automatically once the restore is complete.</p>
          </div>
        </div>
      )}

      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
        <p className="mt-1 text-sm text-gray-500">Manage your profile and app preferences</p>
      </div>

      {/* ── Profile ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-800">Profile</h3>
          <p className="text-xs text-gray-400 mt-0.5">Your name and income details</p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Name</label>
            <input
              type="text" placeholder="Your name"
              value={profileForm.name}
              onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Monthly Take-Home Salary (₹)</label>
            <input
              type="number" min="0" step="1000" placeholder="e.g. 100000"
              value={profileForm.monthly_salary}
              onChange={e => setProfileForm(f => ({ ...f, monthly_salary: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Date of Birth</label>
              <input
                type="date"
                value={profileForm.date_of_birth}
                onChange={e => setProfileForm(f => ({ ...f, date_of_birth: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
              />
              <p className="text-xs text-gray-400 mt-1">Powers age-based allocation guidance</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Target Retirement Age</label>
              <input
                type="number" min="40" max="80" step="1" placeholder="60"
                value={profileForm.retirement_age}
                onChange={e => setProfileForm(f => ({ ...f, retirement_age: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
              />
              <p className="text-xs text-gray-400 mt-1">Used in glide path chart</p>
            </div>
          </div>
          <button
            onClick={saveProfile}
            className="px-5 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            style={{ backgroundColor: '#6C63FF' }}
          >
            {profileSaved ? '✓ Saved' : 'Save Profile'}
          </button>
        </div>
      </div>

      {/* ── Security ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-800">Security</h3>
          <p className="text-xs text-gray-400 mt-0.5">App password encrypted with PBKDF2-HMAC-SHA256 + OS Keychain</p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Current Password</label>
            <input
              type={showPw ? 'text' : 'password'}
              placeholder="Enter current password"
              value={pwForm.current}
              onChange={e => setPwField('current', e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">New Password</label>
            <input
              type={showPw ? 'text' : 'password'}
              placeholder="New password (min 8 chars)"
              value={pwForm.next}
              onChange={e => setPwField('next', e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
            />
            {pwForm.next && (() => {
              const s = pwStrength(pwForm.next)
              return s ? (
                <div className="mt-2 space-y-1">
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-300" style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
                  </div>
                  <p className="text-xs font-semibold" style={{ color: s.color }}>{s.label}</p>
                </div>
              ) : null
            })()}
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Confirm New Password</label>
            <input
              type={showPw ? 'text' : 'password'}
              placeholder="Confirm new password"
              value={pwForm.confirm}
              onChange={e => setPwField('confirm', e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPw(s => !s)}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                {showPw
                  ? <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>
                  : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                }
              </svg>
              {showPw ? 'Hide passwords' : 'Show passwords'}
            </button>
          </div>

          {pwError && <p className="text-sm text-red-500 font-medium">{pwError}</p>}
          {pwStatus === 'ok' && <p className="text-sm text-green-600 font-medium">✓ Password changed successfully</p>}

          <button
            onClick={changePassword}
            disabled={pwStatus === 'saving' || !pwForm.current || !pwForm.next || !pwForm.confirm}
            className="px-5 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
            style={{ backgroundColor: '#6C63FF' }}
          >
            {pwStatus === 'saving' ? 'Changing…' : 'Change Password'}
          </button>
        </div>
      </div>

      {/* ── Manage Users ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-800">Manage Users</h3>
          <p className="text-xs text-gray-400 mt-0.5">Edit user profiles, PINs, and tracker settings</p>
        </div>
        <div className="p-6 space-y-6">
          {/* Admin user */}
          {adminUser && userForms[adminUser.id] && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold text-white"
                  style={{ backgroundColor: userForms[adminUser.id].avatar_color }}>
                  {userForms[adminUser.id].name.charAt(0).toUpperCase()}
                </div>
                <p className="text-sm font-bold text-gray-800">Admin User</p>
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-semibold">Admin</span>
              </div>

              <div className="space-y-3 pl-10">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Display Name</label>
                  <input
                    type="text"
                    value={userForms[adminUser.id].name}
                    onChange={e => setUserField(adminUser.id, 'name', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                  />
                </div>
                <button
                  onClick={() => saveUserProfile(adminUser)}
                  className="px-4 py-2 rounded-xl text-white text-xs font-semibold hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: '#6C63FF' }}
                >
                  Save Name
                </button>

                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Change PIN</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="password" placeholder="New PIN (6+ digits)"
                      value={pinForms[adminUser.id]?.newPin || ''}
                      onChange={e => setPinField(adminUser.id, 'newPin', e.target.value)}
                      inputMode="numeric"
                      className="px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF]"
                    />
                    <input
                      type="password" placeholder="Confirm PIN"
                      value={pinForms[adminUser.id]?.confirmPin || ''}
                      onChange={e => setPinField(adminUser.id, 'confirmPin', e.target.value)}
                      inputMode="numeric"
                      className="px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF]"
                    />
                  </div>
                  <button
                    onClick={() => saveUserPin(adminUser)}
                    className="mt-2 px-4 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Update PIN
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="border-t border-gray-100" />

          {/* Tracker user */}
          {trackerUser && userForms[trackerUser.id] && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold text-white"
                  style={{ backgroundColor: userForms[trackerUser.id].avatar_color }}>
                  {userForms[trackerUser.id].name.charAt(0).toUpperCase()}
                </div>
                <p className="text-sm font-bold text-gray-800">Tracker User</p>
                <span className="text-xs px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 font-semibold">Tracker</span>
              </div>

              <div className="space-y-3 pl-10">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Display Name</label>
                  <input
                    type="text"
                    value={userForms[trackerUser.id].name}
                    onChange={e => setUserField(trackerUser.id, 'name', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Avatar Color</label>
                  <div className="flex gap-2">
                    {AVATAR_COLORS.map(color => (
                      <button
                        key={color}
                        onClick={() => setUserField(trackerUser.id, 'avatar_color', color)}
                        className="w-8 h-8 rounded-lg transition-all duration-150"
                        style={{
                          backgroundColor: color,
                          outline: userForms[trackerUser.id].avatar_color === color ? `3px solid ${color}` : 'none',
                          outlineOffset: '2px',
                          transform: userForms[trackerUser.id].avatar_color === color ? 'scale(1.15)' : 'scale(1)',
                        }}
                      />
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => saveUserProfile(trackerUser)}
                  className="px-4 py-2 rounded-xl text-white text-xs font-semibold hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: '#EC4899' }}
                >
                  Save Profile
                </button>

                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Change PIN</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="password" placeholder="New PIN (6+ digits)"
                      value={pinForms[trackerUser.id]?.newPin || ''}
                      onChange={e => setPinField(trackerUser.id, 'newPin', e.target.value)}
                      inputMode="numeric"
                      className="px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF]"
                    />
                    <input
                      type="password" placeholder="Confirm PIN"
                      value={pinForms[trackerUser.id]?.confirmPin || ''}
                      onChange={e => setPinField(trackerUser.id, 'confirmPin', e.target.value)}
                      inputMode="numeric"
                      className="px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF]"
                    />
                  </div>
                  <button
                    onClick={() => saveUserPin(trackerUser)}
                    className="mt-2 px-4 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Update PIN
                  </button>
                </div>

                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Monthly Expense Budget</p>
                  <div className="flex gap-2 items-center">
                    <span className="text-gray-400 font-semibold">₹</span>
                    <input
                      type="number" min="0" step="100" placeholder="0"
                      value={trackerBudget}
                      onChange={e => setTrackerBudget(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF]"
                    />
                    <button
                      onClick={saveTrackerBudget}
                      className="px-4 py-2 rounded-xl text-white text-xs font-semibold hover:opacity-90 transition-opacity"
                      style={{ backgroundColor: '#10B981' }}
                    >
                      Save
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Tracker sees a warning when they exceed this budget</p>
                </div>

                {/* Tracker this-month summary */}
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">This Month's Activity</p>
                  {trackerExpenseSummary !== null ? (
                    <div className="flex gap-4">
                      <div className="bg-gray-50 rounded-xl px-4 py-2.5 text-center">
                        <p className="text-xs text-gray-400 mb-0.5">Total Spent</p>
                        <p className="text-base font-bold text-gray-900">{fmt(trackerExpenseSummary.total)}</p>
                      </div>
                      <div className="bg-gray-50 rounded-xl px-4 py-2.5 text-center">
                        <p className="text-xs text-gray-400 mb-0.5">Expenses</p>
                        <p className="text-base font-bold text-gray-900">{trackerExpenseSummary.count}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">No data yet</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Import from Phone ───────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-800">Import from Phone</h3>
          <p className="text-xs text-gray-400 mt-0.5">Import expenses and weight logs exported from the WealthLens mobile app</p>
        </div>
        <div className="p-6">
          <p className="text-xs text-gray-500 mb-4 leading-relaxed">
            On the mobile app, go to <span className="font-semibold text-gray-700">Settings → Export & Share Data</span>, then send the JSON file here. Click the button below to select it.
          </p>
          <ImportPhoneButton />
        </div>
      </div>

      {/* ── Google Drive Backup ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-800">Google Drive Backup</h3>
            <p className="text-xs text-gray-400 mt-0.5">Securely back up and restore your financial data</p>
          </div>
          {driveStatus.connected && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 border border-green-200">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-xs font-semibold text-green-700">Connected</span>
            </div>
          )}
        </div>

        <div className="p-6 space-y-5">
          {!driveStatus.connected ? (
            <>
              {!hasCreds ? (
                <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
                  <p className="text-sm font-semibold text-blue-800 mb-1">Setup Required</p>
                  <p className="text-xs text-blue-700 leading-relaxed">
                    You need a Google OAuth2 Client ID and Secret. Create one in{' '}
                    <span className="font-semibold">Google Cloud Console</span> → APIs & Services → Credentials → OAuth 2.0 Client IDs.
                    Set the app type to <span className="font-semibold">Desktop app</span>.
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-gray-50 border border-gray-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-700">Credentials saved ✓</p>
                    <button
                      onClick={() => setShowCreds(s => !s)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                        {showCreds
                          ? <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>
                          : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                        }
                      </svg>
                      {showCreds ? 'Hide' : 'Show credentials'}
                    </button>
                  </div>
                  {showCreds && storedCreds && (
                    <div className="space-y-2">
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Client ID</p>
                        <p className="text-xs font-mono text-gray-700 break-all bg-white border border-gray-200 rounded-lg px-3 py-2 select-all">
                          {storedCreds.clientId}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Client Secret</p>
                        <p className="text-xs font-mono text-gray-700 break-all bg-white border border-gray-200 rounded-lg px-3 py-2 select-all">
                          {storedCreds.clientSecret}
                        </p>
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-gray-500">Click Connect Google Drive to authorise access.</p>
                </div>
              )}

              {showCredsForm && (
                <div className="space-y-3 p-4 rounded-xl border border-gray-200 bg-gray-50">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Client ID</label>
                    <input
                      type="text" placeholder="xxxx.apps.googleusercontent.com"
                      value={credsForm.clientId}
                      onChange={e => setCredsForm(f => ({ ...f, clientId: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Client Secret</label>
                    <input
                      type="password" placeholder="Your client secret"
                      value={credsForm.clientSecret}
                      onChange={e => setCredsForm(f => ({ ...f, clientSecret: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setShowCredsForm(false)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-white transition-colors">
                      Cancel
                    </button>
                    <button
                      onClick={saveCreds}
                      disabled={!credsForm.clientId.trim() || !credsForm.clientSecret.trim()}
                      className="px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
                      style={{ backgroundColor: '#6C63FF' }}
                    >
                      Save Credentials
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setShowCredsForm(s => !s)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  {hasCreds ? 'Update Credentials' : 'Enter Credentials'}
                </button>

                {hasCreds && (
                  <button
                    onClick={connect}
                    disabled={driveOp === 'connecting'}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                    style={{ backgroundColor: '#6C63FF' }}
                  >
                    {driveOp === 'connecting' ? '⏳ Opening browser…' : '🔗 Connect Google Drive'}
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="p-4 rounded-xl bg-green-50 border border-green-100 space-y-2">
                <div className="flex items-center gap-4">
                  <div className="text-3xl">☁️</div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-green-800">{driveStatus.email}</p>
                    <p className="text-xs text-green-600 mt-0.5">Last backup: {fmtDate(driveStatus.lastBackup)}</p>
                    <p className="text-xs text-green-500 mt-0.5">Tokens stored encrypted via OS secure storage</p>
                  </div>
                  <button
                    onClick={() => setShowCreds(s => !s)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-green-700 hover:text-green-900 transition-colors shrink-0"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                      {showCreds
                        ? <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>
                        : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                      }
                    </svg>
                    {showCreds ? 'Hide creds' : 'Show creds'}
                  </button>
                </div>
                {showCreds && storedCreds && (
                  <div className="space-y-2 pt-2 border-t border-green-200">
                    <div>
                      <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-1">Client ID</p>
                      <p className="text-xs font-mono text-green-900 break-all bg-white/60 border border-green-200 rounded-lg px-3 py-2 select-all">
                        {storedCreds.clientId}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-1">Client Secret</p>
                      <p className="text-xs font-mono text-green-900 break-all bg-white/60 border border-green-200 rounded-lg px-3 py-2 select-all">
                        {storedCreds.clientSecret}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Row-level sync (all tables, other devices via WealthLens_sync.json) */}
              <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/50 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Sync with other devices</p>
                    <p className="text-xs text-gray-500 mt-0.5">Last synced: {fmtDate(driveStatus.lastBackup)}</p>
                  </div>
                  <button
                    onClick={syncNow}
                    disabled={syncing}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                    style={{ backgroundColor: '#6C63FF' }}
                  >
                    {syncing ? '⏳ Syncing…' : '🔄 Sync Now'}
                  </button>
                </div>
                {lastSyncResult?.success && (
                  <p className="text-xs text-indigo-700">
                    Synced! {lastSyncResult.rowsUploaded} rows uploaded, {lastSyncResult.rowsDownloaded} rows downloaded
                  </p>
                )}
                <p className="text-[11px] text-gray-400">
                  Auto-syncs every time the app opens and closes. Also runs on the WealthLens PWA (Android) with the same Google account.
                </p>
              </div>

              {/* Sync History */}
              {syncLog.length > 0 && (
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Sync History</p>
                  </div>
                  <div className="divide-y divide-gray-50 max-h-56 overflow-y-auto">
                    {syncLog.map(ev => (
                      <div key={ev.id} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="text-sm shrink-0">{ev.status === 'success' ? '✅' : '❌'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-700 truncate">
                            {fmtDate(ev.synced_at)} · <span className="font-mono">{ev.device_id}</span>
                          </p>
                          <p className="text-[11px] text-gray-400">
                            {ev.status === 'success'
                              ? `${ev.rows_uploaded} rows uploaded, ${ev.rows_downloaded} rows downloaded`
                              : (ev.error_message || 'Sync failed')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Auto-backup toggle */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-gray-50">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Auto-backup on close</p>
                  <p className="text-xs text-gray-400 mt-0.5">Automatically back up when you quit the app</p>
                </div>
                <button
                  onClick={() => toggleAutoBackup(!autoBackup)}
                  className="relative w-12 h-6 rounded-full transition-colors duration-200"
                  style={{ backgroundColor: autoBackup ? '#6C63FF' : '#D1D5DB' }}
                >
                  <div
                    className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"
                    style={{ transform: autoBackup ? 'translateX(24px)' : 'translateX(2px)' }}
                  />
                </button>
              </div>

              {/* Actions */}
              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={backupNow}
                  disabled={!!driveOp}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                  style={{ backgroundColor: '#6C63FF' }}
                >
                  {driveOp === 'backing-up' ? '⏳ Backing up…' : '☁️ Backup Now'}
                </button>
                <button
                  onClick={loadBackups}
                  disabled={loadingBackups}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
                >
                  {loadingBackups ? '⏳ Loading…' : '📋 Show Backups'}
                </button>
                <button
                  onClick={disconnect}
                  className="px-4 py-2.5 rounded-xl border border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors"
                >
                  Disconnect
                </button>
              </div>

              {/* Backup list */}
              {backups.length > 0 && (
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide flex-1">Available Backups</p>
                    <p className="text-xs text-gray-400">Restore replaces local data and restarts the app</p>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {backups.slice(0, 10).map(b => (
                      <div key={b.id} className="flex items-center gap-3 px-4 py-3">
                        <span className="text-xl shrink-0">📦</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{b.name}</p>
                          <p className="text-xs text-gray-400">
                            {fmtDate(b.createdTime)}{b.size ? ` · ${fmtBytes(b.size)}` : ''}
                          </p>
                        </div>
                        <button
                          onClick={() => restore(b.id, b.name)}
                          disabled={!!driveOp || restoring}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 hover:bg-gray-50 text-gray-600 disabled:opacity-60 transition-colors"
                        >
                          {driveOp === 'restoring' || restoring ? '⏳' : 'Restore'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {backups.length === 0 && !loadingBackups && (
                <p className="text-xs text-gray-400 text-center py-2">
                  Click "Show Backups" to list backups from Google Drive.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── About ────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-800">About</h3>
          <p className="text-xs text-gray-400 mt-0.5">Device identity used for sync</p>
        </div>
        <div className="p-6 flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Device ID</p>
            <p className="text-sm font-mono text-gray-700 select-all">{deviceId || '—'}</p>
          </div>
          <p className="text-xs text-gray-400">WealthLens v1.0.0</p>
        </div>
      </div>
    </div>
  )
}
