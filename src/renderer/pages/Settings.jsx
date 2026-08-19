import { useState, useEffect } from 'react'
import bridge from '../lib/bridge'

const IS_ELECTRON = typeof window !== 'undefined' && window.electronAPI !== undefined

const fmtDate = (s) =>
  s ? new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
const fmtBytes = (b) =>
  b ? (Number(b) > 1024 * 1024 ? `${(Number(b) / 1024 / 1024).toFixed(1)} MB` : `${(Number(b) / 1024).toFixed(0)} KB`) : ''
const fmt = v => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0)

function daysAgo(dateStr) {
  if (!dateStr) return 'Never'
  const then = new Date(dateStr)
  if (isNaN(then.getTime())) return 'Never'
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}
function getInitials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

function ImportPhoneButton() {
  const [result, setResult] = useState(null)
  const [importing, setImporting] = useState(false)
  const [users, setUsers] = useState([])
  const [targetUserId, setTargetUserId] = useState('')

  useEffect(() => {
    bridge.getUsers().then(us => {
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

const CATEGORY_COLORS = [
  '#FF6B6B', '#FF8E53', '#F59E0B', '#FBBF24', '#A3E635', '#10B981',
  '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#EC4899',
  '#F43F5E', '#64748B', '#22C55E', '#0EA5E9', '#14B8A6', '#8B93A5',
]

function CategoryManager() {
  const [categories, setCategories] = useState([])
  const [usageCounts, setUsageCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('🏷️')
  const [color, setColor] = useState('#6366F1')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null) // { id, name, count } | null
  const [deleteError, setDeleteError] = useState('')

  async function load() {
    setLoading(true)
    try {
      const [cats, expenses] = await Promise.all([
        bridge.getExpenseCategories(),
        bridge.getAllExpenses({}),
      ])
      setCategories(cats || [])
      const counts = {}
      for (const e of expenses || []) counts[e.category] = (counts[e.category] || 0) + 1
      setUsageCounts(counts)
    } catch {
      setCategories([])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function save() {
    if (!name.trim()) { setFormError('Category name is required'); return }
    if (!icon.trim()) { setFormError('Pick an emoji icon'); return }
    setSaving(true)
    setFormError('')
    try {
      await bridge.createExpenseCategory({ name: name.trim(), icon: icon.trim(), color })
      setName(''); setIcon('🏷️'); setColor('#6366F1')
      setShowForm(false)
      load()
    } catch (err) {
      setFormError(err.message || 'Could not create category')
    }
    setSaving(false)
  }

  function requestDelete(cat) {
    setDeleteError('')
    const count = usageCounts[cat.name] || 0
    if (count > 0) setConfirmDelete({ id: cat.id, name: cat.name, count })
    else doDelete(cat.id)
  }

  async function doDelete(id) {
    setDeleteError('')
    try {
      await bridge.deleteExpenseCategory(id)
      setConfirmDelete(null)
      load()
    } catch (err) {
      setDeleteError(err.message || 'Could not delete category')
      setConfirmDelete(null)
    }
  }

  return (
    <div className="p-6">
      {loading ? (
        <p className="text-sm text-gray-400 text-center py-6">Loading…</p>
      ) : (
        <div className="rounded-xl border border-gray-100 divide-y divide-gray-50 overflow-hidden mb-4">
          {categories.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No categories yet</p>
          ) : categories.map(cat => (
            <div key={cat.id} className="flex items-center gap-3 px-4 py-3">
              <span className="text-lg w-7 text-center shrink-0">{cat.icon || '🏷️'}</span>
              <span className="text-sm font-semibold text-gray-700 flex-1 truncate">{cat.name}</span>
              {usageCounts[cat.name] > 0 && (
                <span className="text-xs text-gray-400 shrink-0">{usageCounts[cat.name]} used</span>
              )}
              <button
                onClick={() => requestDelete(cat)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors text-lg leading-none shrink-0"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {deleteError && <p className="text-xs font-medium text-red-500 mb-3">{deleteError}</p>}

      {!showForm ? (
        <button
          onClick={() => { setShowForm(true); setFormError('') }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-gray-300 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <span className="text-base leading-none">+</span> Add Category
        </button>
      ) : (
        <div className="rounded-xl border border-gray-100 p-4 space-y-3">
          <div className="flex gap-3">
            <input
              type="text" placeholder="🛒" maxLength={4}
              value={icon} onChange={e => setIcon(e.target.value)}
              className="w-14 px-2 py-2 rounded-xl border border-gray-200 text-center text-lg focus:outline-none focus:border-[#6C63FF]"
            />
            <input
              type="text" placeholder="Category name"
              value={name} onChange={e => { setName(e.target.value); setFormError('') }}
              className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF]"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Color</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-lg transition-all"
                  style={{
                    backgroundColor: c,
                    transform: color === c ? 'scale(1.15)' : 'scale(1)',
                    boxShadow: color === c ? `0 0 0 2px white, 0 0 0 4px ${c}` : 'none',
                  }}
                />
              ))}
            </div>
          </div>
          {formError && <p className="text-xs font-medium text-red-500">{formError}</p>}
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button
              onClick={save} disabled={saving}
              className="flex-1 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              style={{ backgroundColor: '#6C63FF' }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={e => e.target === e.currentTarget && setConfirmDelete(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-[360px] shadow-2xl">
            <p className="text-sm font-bold text-gray-900 mb-1">Delete "{confirmDelete.name}"?</p>
            <p className="text-sm text-gray-500 mb-5">
              This category has {confirmDelete.count} expense{confirmDelete.count !== 1 ? 's' : ''}. Delete anyway?
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => doDelete(confirmDelete.id)}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity bg-red-500"
              >
                Delete Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Settings({ onSyncRefresh, currentUser }) {
  // My Profile (identity + financial + health, consolidated)
  const [profileForm, setProfileForm] = useState({
    name: '', mobile_number: '', monthly_salary: '', date_of_birth: '',
    retirement_age: '60', height_cm: '', target_weight_kg: '',
  })
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
  const [driveError, setDriveError]   = useState('')
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

  // User Management — family members (edit modal)
  const [users, setUsers]           = useState([])
  const [editingUser, setEditingUser] = useState(null) // user object or null
  const [editForm, setEditForm]     = useState({ name: '', mobile_number: '', password: '', confirmPassword: '' })
  const [editError, setEditError]   = useState('')
  const [trackerBudget, setTrackerBudget] = useState('')
  const [trackerExpenseSummary, setTrackerExpenseSummary] = useState(null)

  // User Management — my own account (inline edit)
  const [editingMyDetails, setEditingMyDetails] = useState(false)
  const [myDetailsForm, setMyDetailsForm] = useState({ name: '', mobile_number: '', password: '', confirmPassword: '' })
  const [myDetailsError, setMyDetailsError] = useState('')

  // User Management — add family member (modal)
  const [showAddMember, setShowAddMember] = useState(false)
  const [addMemberForm, setAddMemberForm] = useState({ name: '', mobile_number: '', password: '', confirmPassword: '' })
  const [addMemberError, setAddMemberError] = useState('')

  useEffect(() => { loadAll() }, [])

  // Main process pushes this when a Drive API call hits invalid_grant (expired
  // or revoked refresh token) — tokens are already cleared by the time it fires.
  // Drive sync is Electron-only — window.electronAPI doesn't exist in web mode.
  useEffect(() => {
    if (!IS_ELECTRON) return
    const unsubscribe = window.electronAPI.onDriveDisconnected?.((message) => {
      setDriveStatus(s => ({ ...s, connected: false }))
      setDriveError(message || 'Google Drive session expired. Please reconnect in Settings.')
    })
    return () => unsubscribe?.()
  }, [])

  async function loadAll() {
    // Cross-platform (bridge) — works in both Electron and web mode.
    try {
      const [profile, loadedUsers] = await Promise.all([
        bridge.getProfile(),
        bridge.getUsers(),
      ])
      const me = currentUser && (loadedUsers || []).find(u => u.id === currentUser.id)
      setProfileForm({
        name: profile?.name || me?.name || '',
        mobile_number: me?.mobile_number || '',
        monthly_salary: profile?.monthly_salary || '',
        date_of_birth: profile?.date_of_birth || me?.date_of_birth || '',
        retirement_age: String(profile?.retirement_age || 60),
        height_cm: me?.height_cm || '',
        target_weight_kg: me?.target_weight_kg || '',
      })
      if (me) setMyDetailsForm({ name: me.name, mobile_number: me.mobile_number || '', password: '', confirmPassword: '' })
      if (loadedUsers) setUsers(loadedUsers)
    } catch (e) {
      // silent
    }

    // Electron-only — Drive backup, device sync log, tracker budget IPC have
    // no web REST equivalent yet.
    if (IS_ELECTRON) {
      try {
        const [status, hasCr, creds, ab, devId, log] = await Promise.all([
          window.electronAPI.getDriveStatus(),
          window.electronAPI.hasDriveCreds(),
          window.electronAPI.getDriveCredentials(),
          window.electronAPI.getDriveAutoBackup(),
          window.electronAPI.getDeviceId(),
          window.electronAPI.getSyncLog(),
        ])
        setDriveStatus(status || { connected: false, email: null, lastBackup: null })
        setHasCreds(Boolean(hasCr))
        setStoredCreds(creds || null)
        setAutoBackup(Boolean(ab))
        setDeviceId(devId || '')
        setSyncLog(log || [])
      } catch (e) {
        // silent
      }

      try {
        const budget = await window.electronAPI.getTrackerBudget()
        setTrackerBudget(budget ? String(budget) : '')
      } catch {}
    }

    // Load tracker expense summary for this month — use loadedUsers from the same call above
    try {
      const latestUsers = await bridge.getUsers()
      const now = new Date()
      const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const trackerUser = (latestUsers || []).find(u => u.role === 'tracker')
      if (trackerUser) {
        const exps = await bridge.getAllExpenses({ month: ym, logged_by: trackerUser.id })
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
    try {
      await bridge.saveProfile({
        name: profileForm.name,
        monthly_salary: parseFloat(profileForm.monthly_salary) || 0,
        date_of_birth: profileForm.date_of_birth || null,
        retirement_age: parseInt(profileForm.retirement_age) || 60,
      })
      if (currentUser) {
        const result = await bridge.updateUser({
          id: currentUser.id,
          name: profileForm.name,
          mobile_number: profileForm.mobile_number,
          date_of_birth: profileForm.date_of_birth || null,
          height_cm: parseFloat(profileForm.height_cm) || 0,
          target_weight_kg: profileForm.target_weight_kg ? parseFloat(profileForm.target_weight_kg) : null,
        })
        if (result?.success === false) { showToast(result.error || 'Could not save profile', 'error'); return }
      }
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 2000)
      showToast('Profile saved successfully')
      loadAll()
    } catch (e) {
      showToast(e.message || 'Could not save profile', 'error')
    }
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
    const wasReconnect = Boolean(driveError)
    try {
      setDriveOp('connecting')
      const result = await window.electronAPI.connectDrive(browserApp)
      setDriveStatus({ connected: true, email: result.email, lastBackup: null })
      setDriveError('')
      onSyncRefresh?.()

      if (wasReconnect) {
        // Step 5: reconnecting after an expired session immediately re-syncs
        // so the user sees fresh data without a separate manual step.
        const syncResult = await bridge.syncNow()
        onSyncRefresh?.()
        const log = await window.electronAPI.getSyncLog()
        setSyncLog(log || [])
        if (syncResult?.success) showToast('Google Drive reconnected and synced!')
        else showToast(syncResult?.error || 'Reconnected, but sync failed', 'error')
      } else {
        showToast(`Connected as ${result.email}`)
      }
    } catch (e) {
      showToast(e.message || 'Connection failed', 'error')
    } finally {
      setDriveOp(null)
    }
  }

  // "Reconnect Google Drive" (shown on the expired-session banner) — clears any
  // stale tokens first, then runs the normal connect flow.
  async function reconnectDrive() {
    try { await window.electronAPI.disconnectDrive() } catch {}
    await connect()
  }

  async function disconnect() {
    await window.electronAPI.disconnectDrive()
    setDriveStatus({ connected: false, email: null, lastBackup: null })
    setDriveError('')
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
      const result = await bridge.syncNow()
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

  function openEditUser(user) {
    setEditingUser(user)
    setEditForm({ name: user.name, mobile_number: user.mobile_number || '', password: '', confirmPassword: '' })
    setEditError('')
  }

  async function saveUser() {
    if (!editForm.name.trim()) { setEditError('Name cannot be empty'); return }
    if (!/^\d{10}$/.test(editForm.mobile_number)) { setEditError('Mobile number must be 10 digits'); return }
    if (editForm.password || editForm.confirmPassword) {
      if (editForm.password.length < 8) { setEditError('Password must be at least 8 characters'); return }
      if (editForm.password !== editForm.confirmPassword) { setEditError('Passwords do not match'); return }
    }
    try {
      const result = await bridge.updateUser({
        id: editingUser.id,
        name: editForm.name.trim(),
        mobile_number: editForm.mobile_number,
        password: editForm.password || undefined,
      })
      if (result?.success === false) { setEditError(result.error || 'Could not save changes'); return }
      showToast(`${editingUser.role === 'admin' ? 'Admin' : 'Tracker'} account updated`)
      setEditingUser(null)
      loadAll()
    } catch (e) {
      setEditError(e.message || 'Could not save changes')
    }
  }

  function openEditMyDetails() {
    setMyDetailsForm({ name: currentUser?.name || profileForm.name, mobile_number: profileForm.mobile_number, password: '', confirmPassword: '' })
    setMyDetailsError('')
    setEditingMyDetails(true)
  }

  async function saveMyDetails() {
    if (!myDetailsForm.name.trim()) { setMyDetailsError('Name cannot be empty'); return }
    if (!/^\d{10}$/.test(myDetailsForm.mobile_number)) { setMyDetailsError('Mobile number must be 10 digits'); return }
    if (myDetailsForm.password || myDetailsForm.confirmPassword) {
      if (myDetailsForm.password.length < 8) { setMyDetailsError('Password must be at least 8 characters'); return }
      if (myDetailsForm.password !== myDetailsForm.confirmPassword) { setMyDetailsError('Passwords do not match'); return }
    }
    try {
      const result = await bridge.updateUser({
        id: currentUser.id,
        name: myDetailsForm.name.trim(),
        mobile_number: myDetailsForm.mobile_number,
        password: myDetailsForm.password || undefined,
      })
      if (result?.success === false) { setMyDetailsError(result.error || 'Could not save changes'); return }
      showToast('Your details were updated')
      setEditingMyDetails(false)
      loadAll()
    } catch (e) {
      setMyDetailsError(e.message || 'Could not save changes')
    }
  }

  function openAddMember() {
    setAddMemberForm({ name: '', mobile_number: '', password: '', confirmPassword: '' })
    setAddMemberError('')
    setShowAddMember(true)
  }

  async function createFamilyMember() {
    if (!addMemberForm.name.trim()) { setAddMemberError('Name cannot be empty'); return }
    if (!/^\d{10}$/.test(addMemberForm.mobile_number)) { setAddMemberError('Mobile number must be 10 digits'); return }
    if (addMemberForm.password.length < 8) { setAddMemberError('Password must be at least 8 characters'); return }
    if (addMemberForm.password !== addMemberForm.confirmPassword) { setAddMemberError('Passwords do not match'); return }
    try {
      const result = await bridge.createUser({
        name: addMemberForm.name.trim(),
        mobile_number: addMemberForm.mobile_number,
        password: addMemberForm.password,
        role: 'tracker',
      })
      if (result?.success === false) { setAddMemberError(result.error || 'Could not create account'); return }
      showToast('Family member added')
      setShowAddMember(false)
      loadAll()
    } catch (e) {
      setAddMemberError(e.message || 'Could not create account')
    }
  }

  async function deleteFamilyMember(user) {
    if (!confirm(`Delete ${user.name}? Their expense and weight data will also be deleted.`)) return
    try {
      const result = await bridge.deleteUser(user.id)
      if (result?.success === false) { showToast(result.error || 'Could not delete', 'error'); return }
      showToast(`${user.name} deleted`)
      loadAll()
    } catch (e) {
      showToast(e.message || 'Could not delete', 'error')
    }
  }

  async function saveTrackerBudget() {
    const amount = parseFloat(trackerBudget) || 0
    await window.electronAPI.setTrackerBudget(amount)
    showToast('Tracker budget saved')
  }

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

      {/* ── My Profile ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center text-base font-bold text-white shrink-0"
            style={{ backgroundColor: currentUser?.avatar_color || '#6C63FF' }}
          >
            {getInitials(profileForm.name || currentUser?.name)}
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-800">My Profile</h3>
            <p className="text-xs text-gray-400 mt-0.5">Identity, income, and health details used across the app</p>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
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
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Mobile Number</label>
              <input
                type="tel" inputMode="numeric" placeholder="9000000001"
                value={profileForm.mobile_number}
                onChange={e => setProfileForm(f => ({ ...f, mobile_number: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
              />
            </div>
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Height (cm)</label>
              <input
                type="number" min="50" max="250" step="0.1" placeholder="e.g. 175"
                value={profileForm.height_cm}
                onChange={e => setProfileForm(f => ({ ...f, height_cm: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
              />
              <p className="text-xs text-gray-400 mt-1">Used to calculate BMI</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Target Weight (kg)</label>
              <input
                type="number" min="20" max="300" step="0.01" inputMode="decimal" placeholder="e.g. 70.5"
                value={profileForm.target_weight_kg}
                onChange={e => setProfileForm(f => ({ ...f, target_weight_kg: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
              />
              <p className="text-xs text-gray-400 mt-1">Shown on the Weight Trend card</p>
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

      {/* ── Security — Electron-only app-lock password (separate from user login) ── */}
      {IS_ELECTRON && (
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
      )}

      {/* ── User Management ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-800">👥 User Management</h3>
          <p className="text-xs text-gray-400 mt-0.5">Your account, plus family members who can log expenses and weight</p>
        </div>

        {/* My account */}
        <div className="p-6 border-b border-gray-100">
          {!editingMyDetails ? (
            <div className="flex items-center gap-3 flex-wrap">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                style={{ backgroundColor: currentUser?.avatar_color || '#6C63FF' }}
              >
                {getInitials(myDetailsForm.name)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900">{myDetailsForm.name || '—'}</p>
                <p className="text-xs text-gray-400">{myDetailsForm.mobile_number || '—'}</p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-semibold">Admin</span>
              <button
                onClick={openEditMyDetails}
                className="ml-auto px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Edit My Details
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Name</label>
                  <input
                    type="text"
                    value={myDetailsForm.name}
                    onChange={e => setMyDetailsForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Mobile Number</label>
                  <input
                    type="tel" inputMode="numeric"
                    value={myDetailsForm.mobile_number}
                    onChange={e => setMyDetailsForm(f => ({ ...f, mobile_number: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">New Password</label>
                  <input
                    type="password" placeholder="Leave blank to keep"
                    value={myDetailsForm.password}
                    onChange={e => setMyDetailsForm(f => ({ ...f, password: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF]"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Confirm</label>
                  <input
                    type="password" placeholder="Repeat password"
                    value={myDetailsForm.confirmPassword}
                    onChange={e => setMyDetailsForm(f => ({ ...f, confirmPassword: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF]"
                  />
                </div>
              </div>
              {myDetailsError && <p className="text-xs font-medium text-red-500">{myDetailsError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingMyDetails(false)}
                  className="flex-1 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveMyDetails}
                  className="flex-1 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: '#6C63FF' }}
                >
                  Save Changes
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Family members */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-800">Family Members</p>
          <button
            onClick={openAddMember}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-semibold hover:opacity-90 transition-opacity"
            style={{ backgroundColor: '#6C63FF' }}
          >
            + Add Family Member
          </button>
        </div>

        {users.filter(u => u.role !== 'admin').length === 0 ? (
          <p className="px-6 py-8 text-sm text-gray-400 text-center">No family members yet</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {users.filter(u => u.role !== 'admin').map(u => (
              <div key={u.id} className="px-6 py-3 flex items-center gap-3 flex-wrap">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ backgroundColor: u.avatar_color || '#EC4899' }}
                >
                  {getInitials(u.name)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-800">{u.name}</p>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 font-semibold">Tracker</span>
                  </div>
                  <p className="text-xs text-gray-400">{u.mobile_number || '—'} · Last login: {daysAgo(u.last_login_at)}</p>
                </div>
                <div className="ml-auto flex gap-2 shrink-0">
                  <button
                    onClick={() => openEditUser(u)}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteFamilyMember(u)}
                    className="px-3 py-1.5 rounded-lg border border-red-200 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {trackerUser && (
          <div className="p-6 space-y-4 border-t border-gray-100">
            {IS_ELECTRON && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tracker Monthly Expense Budget</p>
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
            )}

            <div>
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
        )}
      </div>

      {/* ── Edit family member modal ────────────────────────────────────── */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-sm">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-base font-bold text-gray-900">Edit User</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 font-semibold">Tracker</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Mobile Number</label>
                <input
                  type="tel" inputMode="numeric"
                  value={editForm.mobile_number}
                  onChange={e => setEditForm(f => ({ ...f, mobile_number: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">New Password</label>
                  <input
                    type="password" placeholder="Leave blank to keep"
                    value={editForm.password}
                    onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF]"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Confirm</label>
                  <input
                    type="password" placeholder="Repeat password"
                    value={editForm.confirmPassword}
                    onChange={e => setEditForm(f => ({ ...f, confirmPassword: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF]"
                  />
                </div>
              </div>

              {editError && <p className="text-xs font-medium text-red-500">{editError}</p>}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setEditingUser(null)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveUser}
                  className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: '#6C63FF' }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add family member modal ─────────────────────────────────────── */}
      {showAddMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-sm">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-base font-bold text-gray-900">Add Family Member</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 font-semibold">Tracker</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Name</label>
                <input
                  autoFocus type="text" placeholder="e.g. Spouse"
                  value={addMemberForm.name}
                  onChange={e => setAddMemberForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Mobile Number</label>
                <input
                  type="tel" inputMode="numeric" placeholder="9000000002"
                  value={addMemberForm.mobile_number}
                  onChange={e => setAddMemberForm(f => ({ ...f, mobile_number: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Password</label>
                  <input
                    type="password" placeholder="8+ characters"
                    value={addMemberForm.password}
                    onChange={e => setAddMemberForm(f => ({ ...f, password: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF]"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Confirm Password</label>
                  <input
                    type="password" placeholder="Repeat password"
                    value={addMemberForm.confirmPassword}
                    onChange={e => setAddMemberForm(f => ({ ...f, confirmPassword: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#6C63FF]"
                  />
                </div>
              </div>

              {addMemberError && <p className="text-xs font-medium text-red-500">{addMemberError}</p>}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowAddMember(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={createFamilyMember}
                  className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: '#6C63FF' }}
                >
                  Create Account
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Expense Categories (Settings is admin-only end to end) ─────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-800">🏷️ Expense Categories</h3>
          <p className="text-xs text-gray-400 mt-0.5">Manage the categories available when logging an expense</p>
        </div>
        <CategoryManager />
      </div>

      {/* ── Import from Phone — Electron-only (uses local file paths) ──────── */}
      {IS_ELECTRON && (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-800">Import from Phone</h3>
          <p className="text-xs text-gray-400 mt-0.5">Import expenses and weight logs exported from the Lifelog mobile app</p>
        </div>
        <div className="p-6">
          <p className="text-xs text-gray-500 mb-4 leading-relaxed">
            On the mobile app, go to <span className="font-semibold text-gray-700">Settings → Export & Share Data</span>, then send the JSON file here. Click the button below to select it.
          </p>
          <ImportPhoneButton />
        </div>
      </div>
      )}

      {/* ── Google Drive Backup — Electron-only OAuth flow ──────────────── */}
      {!IS_ELECTRON ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-base font-semibold text-gray-800">Google Drive Backup</h3>
            <p className="text-xs text-gray-400 mt-0.5">Securely back up and restore your financial data</p>
          </div>
          <div className="p-6">
            <p className="text-sm text-gray-500">Google Drive sync is available in the desktop app</p>
          </div>
        </div>
      ) : (
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

        {driveError && (
          <div className="mx-6 mt-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-2.5">
              <span className="text-lg leading-none">🔴</span>
              <div>
                <p className="text-sm font-semibold text-red-800">Google Drive disconnected — session expired</p>
                <p className="text-xs text-red-600 mt-0.5">{driveError}</p>
              </div>
            </div>
            <button
              onClick={reconnectDrive}
              disabled={driveOp === 'connecting'}
              className="px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 shrink-0"
              style={{ backgroundColor: '#EF4444' }}
            >
              {driveOp === 'connecting' ? '⏳ Reconnecting…' : '🔄 Reconnect Google Drive'}
            </button>
          </div>
        )}

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
                  Auto-syncs every time the app opens and closes. Also runs on the Lifelog PWA (Android) with the same Google account.
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

          <p className="text-[11px] text-gray-400 pt-2 border-t border-gray-100">
            If Drive keeps disconnecting, your OAuth app is likely still in "Testing" mode, which makes Google
            expire refresh tokens after 7 days. Fix it once: Google Cloud Console → OAuth consent screen →
            change Publishing status from "Testing" to "In production" (no Google verification needed for a
            personal app — it just won't be listed publicly).
          </p>
        </div>
      </div>
      )}

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
          <p className="text-xs text-gray-400">Lifelog v1.0.0</p>
        </div>
      </div>
    </div>
  )
}
