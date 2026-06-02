import { useState, useEffect } from 'react'

const fmtDate = (s) =>
  s ? new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
const fmtBytes = (b) =>
  b ? (Number(b) > 1024 * 1024 ? `${(Number(b) / 1024 / 1024).toFixed(1)} MB` : `${(Number(b) / 1024).toFixed(0)} KB`) : ''

export default function Settings({ onSyncRefresh }) {
  // Profile
  const [profileForm, setProfileForm] = useState({ name: '', monthly_salary: '' })
  const [profileSaved, setProfileSaved] = useState(false)

  // Drive
  const [driveStatus, setDriveStatus] = useState({ connected: false, email: null, lastBackup: null })
  const [hasCreds, setHasCreds]       = useState(false)
  const [credsForm, setCredsForm]     = useState({ clientId: '', clientSecret: '' })
  const [showCredsForm, setShowCredsForm] = useState(false)
  const [autoBackup, setAutoBackup]   = useState(false)
  const [backups, setBackups]         = useState([])
  const [loadingBackups, setLoadingBackups] = useState(false)
  const [driveOp, setDriveOp]         = useState(null)
  const [toast, setToast]             = useState(null)
  const [restoring, setRestoring]     = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    try {
      const [profile, status, hasCr, ab] = await Promise.all([
        window.electronAPI.getProfile(),
        window.electronAPI.getDriveStatus(),
        window.electronAPI.hasDriveCreds(),
        window.electronAPI.getDriveAutoBackup(),
      ])
      if (profile) setProfileForm({ name: profile.name || '', monthly_salary: profile.monthly_salary || '' })
      setDriveStatus(status || { connected: false, email: null, lastBackup: null })
      setHasCreds(Boolean(hasCr))
      setAutoBackup(Boolean(ab))
    } catch (e) {
      console.error(e)
    }
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  async function saveProfile() {
    await window.electronAPI.saveProfile({
      name: profileForm.name,
      monthly_salary: parseFloat(profileForm.monthly_salary) || 0,
    })
    setProfileSaved(true)
    setTimeout(() => setProfileSaved(false), 2000)
    showToast('Profile saved successfully')
  }

  async function saveCreds() {
    if (!credsForm.clientId.trim() || !credsForm.clientSecret.trim()) return
    await window.electronAPI.saveDriveCredentials(credsForm.clientId.trim(), credsForm.clientSecret.trim())
    setHasCreds(true)
    setShowCredsForm(false)
    setCredsForm({ clientId: '', clientSecret: '' })
    showToast('Credentials saved')
  }

  async function connect() {
    if (!hasCreds) { setShowCredsForm(true); return }
    try {
      setDriveOp('connecting')
      const result = await window.electronAPI.connectDrive()
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
    // Get last local DB change timestamp before prompting
    let lastChange = null
    try {
      lastChange = await window.electronAPI.getDriveDbLastModified()
    } catch {}

    const lastChangeStr = lastChange ? fmtDate(lastChange) : 'unknown'
    const confirmed = confirm(
      `Restore from "${fileName}"?\n\n` +
      `⚠️ This will overwrite your local data.\n` +
      `Last local change was: ${lastChangeStr}\n\n` +
      `The app will restart automatically after restoring. Continue?`
    )
    if (!confirmed) return

    try {
      setRestoring(true)
      setDriveOp('restoring')
      showToast('Restoring… app will restart shortly.', 'success')
      await window.electronAPI.driveRestore(fileId)
      // App will auto-restart via main process; show fallback message in case of delay
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
          <button
            onClick={saveProfile}
            className="px-5 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            style={{ backgroundColor: '#6C63FF' }}
          >
            {profileSaved ? '✓ Saved' : 'Save Profile'}
          </button>
        </div>
      </div>

      {/* ── Google Drive Backup ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
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
            /* ── Not connected ── */
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
                <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                  <p className="text-sm font-semibold text-gray-700">Credentials saved ✓</p>
                  <p className="text-xs text-gray-500 mt-0.5">Click Connect Google Drive to authorise access. Tokens are stored encrypted using OS-level secure storage.</p>
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
            /* ── Connected ── */
            <>
              <div className="flex items-center gap-4 p-4 rounded-xl bg-green-50 border border-green-100">
                <div className="text-3xl">☁️</div>
                <div>
                  <p className="text-sm font-bold text-green-800">{driveStatus.email}</p>
                  <p className="text-xs text-green-600 mt-0.5">Last backup: {fmtDate(driveStatus.lastBackup)}</p>
                  <p className="text-xs text-green-500 mt-0.5">Tokens stored encrypted via OS secure storage</p>
                </div>
              </div>

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
    </div>
  )
}
