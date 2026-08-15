import { app, BrowserWindow, ipcMain, shell, safeStorage } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { pbkdf2Sync, randomBytes, randomUUID } from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import bcrypt from 'bcryptjs'
import {
  initDatabase, getDb,
  getAllUsers, getUserByMobile, updateUserAuth, createUser, updateUserLastLogin,
  generateExpenseSyncId, getAllExpensesForSync, mergeExpensesFromSync,
  logSyncEvent, getSyncLog,
} from '../db/database.js'
import { buildSyncFile, applySyncMerge } from '../db/sync.js'
import {
  initiateAuth, disconnect as driveDisconnect, backupDatabase, listBackups,
  restoreFromDrive, getDriveStatus, getSyncStatus, getDbLastModified,
  getStoredCreds, saveCreds, getAppSettings, saveAppSettings,
  getOrCreateDeviceId, pushExpensesSync, pullExpensesSync,
  pullSyncFile, pushSyncFile, markSyncSuccess, markSyncFailed,
} from './googleDrive.js'

let mainWindow

const iconPath = join(__dirname, '../../resources/icon.icns')

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    titleBarStyle: 'default',
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const dbPath      = join(app.getPath('userData'), 'wealthlens.db')
const authFilePath = join(app.getPath('userData'), 'auth.enc')
const sessionFilePath = join(app.getPath('userData'), 'session.enc')

// ── Auth session state (in-memory; resets every app restart) ─────────────
let sessionUnlocked   = false
let authFailedAttempts = 0
let authLockoutUntil   = 0

// ── User session (replaces single-password lock for role-based access) ────
// In-memory copy, hydrated from sessionFilePath on first auth:getSession call
// after a restart so login survives quitting the app (mobile+password auth).
let currentUserSession = null // { id, name, role, lastActivity }

function loadPersistedSession() {
  try {
    if (!existsSync(sessionFilePath)) return null
    const buf = readFileSync(sessionFilePath)
    const json = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8')
    return JSON.parse(json)
  } catch { return null }
}

function savePersistedSession(session) {
  const json = JSON.stringify(session)
  if (safeStorage.isEncryptionAvailable()) {
    writeFileSync(sessionFilePath, safeStorage.encryptString(json))
  } else {
    writeFileSync(sessionFilePath, json, 'utf8')
  }
}

function clearPersistedSession() {
  try { if (existsSync(sessionFilePath)) writeFileSync(sessionFilePath, '') } catch {}
}

function authHash(password, salt) {
  return pbkdf2Sync(password, salt, 600_000, 32, 'sha256').toString('hex')
}

function loadAuthData() {
  try {
    if (!existsSync(authFilePath)) return null
    const buf = readFileSync(authFilePath)
    if (safeStorage.isEncryptionAvailable()) {
      try {
        return JSON.parse(safeStorage.decryptString(buf))
      } catch {
        return JSON.parse(buf.toString('utf8'))
      }
    }
    return JSON.parse(buf.toString('utf8'))
  } catch { return null }
}

function saveAuthData(data) {
  const json = JSON.stringify(data)
  if (safeStorage.isEncryptionAvailable()) {
    writeFileSync(authFilePath, safeStorage.encryptString(json))
  } else {
    writeFileSync(authFilePath, json, 'utf8')
  }
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock.setIcon(join(__dirname, '../../resources/icon.png'))
  }
  initDatabase()
  setupIpcHandlers()
  repairGoalInvestmentLinks(getDb())
  syncAllGoalsWithInvestments(getDb())
  createWindow()

  // Auto-sync on open — fire and forget so window creation isn't blocked on a
  // network round-trip. No-ops silently if Drive isn't connected.
  performFullSync(getDb()).catch(() => {})

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', async () => {
  // Auto-sync on close, independent of the full-DB "auto-backup" toggle below —
  // this is the row-level sync, always attempted while a Drive account is connected.
  try { await performFullSync(getDb()) } catch {}

  const settings = getAppSettings()
  if (!settings.autoBackup) return
  const creds = getStoredCreds()
  if (!creds) return
  try { await backupDatabase(dbPath) } catch {}
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Credits elapsed SIP periods (monthly or weekly) to invested_amount only.
// current_value is left untouched — it reflects whatever the user last entered
// manually (real market value), and should never be silently bumped by this job.
// Called on every investments:getAll so amounts are always up to date when the user views them.
function autoApplySIPs(db) {
  const sips = db.prepare(`
    SELECT id, monthly_sip_amount, sip_frequency, sip_last_applied_at, start_date
    FROM investments
    WHERE type = 'mf_sip' AND monthly_sip_amount > 0 AND sip_last_applied_at IS NOT NULL
  `).all()

  const applyUpdate = db.prepare(`
    UPDATE investments
    SET invested_amount      = invested_amount + ?,
        sip_last_applied_at  = datetime('now'),
        last_updated_at      = datetime('now')
    WHERE id = ?
  `)

  const now = new Date()

  for (const inv of sips) {
    const last = new Date(inv.sip_last_applied_at)
    if (isNaN(last.getTime())) continue

    let periods = 0

    if (inv.sip_frequency === 'weekly') {
      periods = Math.floor((now - last) / (7 * 24 * 60 * 60 * 1000))
    } else {
      // Monthly: advance month-by-month checking whether the SIP day has arrived
      const sipDay = inv.start_date ? new Date(inv.start_date).getDate() : 1
      let cursor = new Date(last)

      for (;;) {
        const nextYear  = cursor.getMonth() === 11 ? cursor.getFullYear() + 1 : cursor.getFullYear()
        const nextMonth = cursor.getMonth() === 11 ? 0 : cursor.getMonth() + 1
        const maxDay    = new Date(nextYear, nextMonth + 1, 0).getDate()
        const sipDate   = new Date(nextYear, nextMonth, Math.min(sipDay, maxDay))

        if (sipDate <= now) {
          periods++
          cursor = sipDate
        } else {
          break
        }
      }
    }

    if (periods > 0) {
      const addition = periods * inv.monthly_sip_amount
      applyUpdate.run(addition, inv.id)
    }
  }
}

// Pulls current_value from every investment linked to a goal, sums them into the
// goal's current_amount, and logs the net change as a single 'auto_linked' contribution.
function syncGoalFromInvestments(db, goalId) {
  const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(goalId)
  if (!goal) return { synced: false }

  const linked = db.prepare(`
    SELECT i.* FROM goal_investments gi
    JOIN investments i ON i.id = gi.investment_id
    WHERE gi.goal_id = ? AND i.deleted_at IS NULL
  `).all(goalId)
  if (linked.length === 0) return { synced: false, linkedCount: 0 }

  const sum = linked.reduce((s, inv) => s + (inv.current_value || 0), 0)
  const delta = sum - (goal.current_amount || 0)
  const names = linked.map(inv => inv.name).join(', ')

  const tx = db.transaction(() => {
    if (Math.abs(delta) >= 0.01) {
      db.prepare(`
        INSERT INTO goal_contributions (goal_id, amount, note, contributed_at, contribution_type)
        VALUES (?, ?, ?, datetime('now'), 'auto_linked')
      `).run(goalId, delta, `Auto-synced from: ${names}`)
    }
    db.prepare(`UPDATE goals SET current_amount = ?, last_synced_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
      .run(sum, goalId)
  })
  tx()

  return { synced: true, changed: Math.abs(delta) >= 0.01, newAmount: sum, linkedCount: linked.length, investments: linked }
}

// Silently syncs every goal that has at least one linked investment. Called once on
// app startup so goal totals are fresh without the user needing to open each goal.
function syncAllGoalsWithInvestments(db) {
  const goalIds = db.prepare('SELECT DISTINCT goal_id FROM goal_investments').all().map(r => r.goal_id)
  for (const goalId of goalIds) {
    try { syncGoalFromInvestments(db, goalId) } catch (e) { console.error('Startup goal sync failed for goal', goalId, e) }
  }
}

// Keeps the goal_investments junction table in sync with the single "Link to Goal"
// dropdown on the investment form. The dropdown can only represent one goal at a
// time, so this only ever touches the (oldGoalId, investmentId) / (newGoalId,
// investmentId) rows — it never wipes links created via the goal-side multi-select
// picker (goalInvestments:setForGoal) for OTHER goals on the same investment.
function syncInvestmentGoalLink(db, investmentId, oldGoalId, newGoalId) {
  const insertLink = db.prepare(`
    INSERT OR IGNORE INTO goal_investments (sync_id, goal_id, investment_id, updated_at)
    VALUES (?, ?, ?, datetime('now'))
  `)
  if (oldGoalId === newGoalId) {
    if (newGoalId) insertLink.run(randomUUID(), newGoalId, investmentId)
    return
  }
  const tx = db.transaction(() => {
    if (oldGoalId) db.prepare('DELETE FROM goal_investments WHERE goal_id = ? AND investment_id = ?').run(oldGoalId, investmentId)
    if (newGoalId) insertLink.run(randomUUID(), newGoalId, investmentId)
  })
  tx()
}

// One-time repair: investments saved with a goal_id before this fix existed never
// got a goal_investments row, so they were invisible to Goal Detail's "Linked
// Investments" list and to the current_amount auto-sync. Backfill them. Idempotent —
// safe to run on every startup (a no-op once the junction rows exist).
function repairGoalInvestmentLinks(db) {
  const orphaned = db.prepare(`
    SELECT i.id as investment_id, i.name as investment_name, i.goal_id, g.title as goal_title
    FROM investments i
    JOIN goals g ON g.id = i.goal_id
    WHERE i.goal_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM goal_investments gi
        WHERE gi.investment_id = i.id AND gi.goal_id = i.goal_id
      )
  `).all()

  if (orphaned.length === 0) {
    console.log('[repairGoalInvestmentLinks] no orphaned investment→goal links found')
    return
  }

  console.log(`[repairGoalInvestmentLinks] found ${orphaned.length} investment(s) with a goal_id but no goal_investments row — backfilling:`)
  const insert = db.prepare('INSERT OR IGNORE INTO goal_investments (goal_id, investment_id) VALUES (?, ?)')
  const affectedGoalIds = new Set()
  for (const row of orphaned) {
    console.log(`  - "${row.investment_name}" (investment #${row.investment_id}) → "${row.goal_title}" (goal #${row.goal_id})`)
    insert.run(row.goal_id, row.investment_id)
    affectedGoalIds.add(row.goal_id)
  }

  for (const goalId of affectedGoalIds) {
    const result = syncGoalFromInvestments(db, goalId)
    console.log(`  [repairGoalInvestmentLinks] synced goal #${goalId} →`, result)
  }
}

// ── Row-level Google Drive sync (WealthLens_sync.json) ─────────────────────
// Pull → merge (last-write-wins per row) → push the merged snapshot back, so
// Drive always ends up holding the union of both sides. Safe to call whenever
// — it's a no-op beyond a single round-trip if Drive isn't connected or
// nothing changed. Every call is logged to sync_log for Settings → Sync History.
let _syncInFlight = false
async function performFullSync(db) {
  if (_syncInFlight) return { success: false, error: 'Sync already in progress' }
  const { connected } = getDriveStatus()
  if (!connected) return { success: false, error: 'Not connected to Google Drive' }

  _syncInFlight = true
  const deviceId = getOrCreateDeviceId()
  try {
    const remote = await pullSyncFile() // null on first-ever sync
    const { downloaded } = applySyncMerge(db, remote?.data, deviceId)
    // A merge can pull in investments/links created on another device — re-run
    // the existing goal auto-sync so current_amount reflects them immediately.
    if (downloaded > 0) syncAllGoalsWithInvestments(db)

    const merged = buildSyncFile(db, deviceId)
    await pushSyncFile(merged)

    const uploaded = merged.data
      ? Object.values(merged.data).reduce((s, v) => s + (Array.isArray(v) ? v.length : v ? 1 : 0), 0)
      : 0

    markSyncSuccess()
    logSyncEvent(db, { deviceId, status: 'success', rowsUploaded: uploaded, rowsDownloaded: downloaded })
    return { success: true, rowsUploaded: uploaded, rowsDownloaded: downloaded, syncedAt: new Date().toISOString() }
  } catch (e) {
    // driveApiCall (googleDrive.js) already cleared the stale tokens and
    // notified the renderer for an invalid_grant/expired-session failure —
    // just log a friendlier message here and return normally, never throw.
    const isAuthExpired = e.message === 'DRIVE_DISCONNECTED'
    const message = isAuthExpired ? 'Drive disconnected — reconnect in Settings' : e.message
    markSyncFailed()
    logSyncEvent(db, { deviceId, status: 'failed', errorMessage: message })
    return { success: false, error: message, disconnected: isAuthExpired }
  } finally {
    _syncInFlight = false
  }
}

function setupIpcHandlers() {
  const db = getDb()

  // ── App lock / auth ───────────────────────────────────────────────────────
  ipcMain.handle('auth:hasPassword', () =>
    existsSync(authFilePath) && loadAuthData() !== null
  )

  ipcMain.handle('auth:isUnlocked', () => sessionUnlocked)

  ipcMain.handle('auth:getLockoutStatus', () => {
    const now = Date.now()
    if (now < authLockoutUntil) {
      return { locked: true, waitSec: Math.ceil((authLockoutUntil - now) / 1000), attempts: authFailedAttempts }
    }
    return { locked: false, attempts: authFailedAttempts }
  })

  ipcMain.handle('auth:verify', (_, password) => {
    const now = Date.now()
    if (now < authLockoutUntil) {
      return { success: false, lockout: true, waitSec: Math.ceil((authLockoutUntil - now) / 1000) }
    }
    const data = loadAuthData()
    if (!data) return { success: false, error: 'No password set' }

    const hash = authHash(password, data.salt)
    if (hash === data.hash) {
      sessionUnlocked = true
      authFailedAttempts = 0
      authLockoutUntil = 0
      return { success: true }
    }

    authFailedAttempts++
    if (authFailedAttempts >= 5) {
      // Exponential backoff: 30s, 60s, 120s, 240s … capped at 1 hour
      const delaySec = Math.min(30 * Math.pow(2, authFailedAttempts - 5), 3600)
      authLockoutUntil = now + delaySec * 1000
      return { success: false, lockout: true, waitSec: delaySec, attempts: authFailedAttempts, error: `Too many attempts. Locked for ${delaySec}s.` }
    }
    const remaining = 5 - authFailedAttempts
    return {
      success: false,
      error: `Incorrect password. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining before lockout.`,
      attempts: authFailedAttempts,
    }
  })

  ipcMain.handle('auth:setPassword', (_, password) => {
    const salt = randomBytes(32).toString('hex')
    const hash = authHash(password, salt)
    saveAuthData({ salt, hash, createdAt: new Date().toISOString() })
    sessionUnlocked = true
    authFailedAttempts = 0
    authLockoutUntil = 0
    return { success: true }
  })

  ipcMain.handle('auth:changePassword', (_, { currentPassword, newPassword }) => {
    const data = loadAuthData()
    if (!data) return { success: false, error: 'No password set' }
    const hash = authHash(currentPassword, data.salt)
    if (hash !== data.hash) return { success: false, error: 'Current password is incorrect' }
    const newSalt = randomBytes(32).toString('hex')
    const newHash = authHash(newPassword, newSalt)
    saveAuthData({ salt: newSalt, hash: newHash, createdAt: new Date().toISOString() })
    return { success: true }
  })

  ipcMain.handle('auth:lock', () => {
    sessionUnlocked = false
    return { success: true }
  })

  // ── Users ─────────────────────────────────────────────────────────────────
  ipcMain.handle('users:getAll', () => getAllUsers(db))

  // { id, name, mobile_number, password? } — password omitted keeps the existing hash.
  ipcMain.handle('users:update', (_, { id, name, mobile_number, password }) => {
    const password_hash = password ? bcrypt.hashSync(password, 10) : null
    updateUserAuth(db, { id, name, mobile_number, password_hash })
    return { success: true }
  })

  // Admin-created additional accounts (e.g. the optional tracker in the
  // first-launch wizard's step 2). Renderer only exposes this while signed in
  // as admin — see App.jsx / AccountSetup.jsx.
  ipcMain.handle('users:create', (_, { name, role, mobile_number, password }) => {
    const user = createUser(db, { name, role, mobile_number, password_hash: bcrypt.hashSync(password, 10) })
    return { success: true, user: { id: user.id, name: user.name, role: user.role, avatar_color: user.avatar_color } }
  })

  // ── Mobile + password auth (replaces per-user PIN login) ───────────────────
  ipcMain.handle('auth:hasAnyUser', () => getAllUsers(db).length > 0)

  ipcMain.handle('auth:login', (_, { mobile_number, password }) => {
    const user = getUserByMobile(db, mobile_number)
    if (!user || !user.password_hash || !bcrypt.compareSync(String(password), user.password_hash)) {
      return { success: false, error: 'Invalid mobile number or password' }
    }
    updateUserLastLogin(db, user.id)
    const session = { id: user.id, name: user.name, role: user.role, lastActivity: Date.now(), loggedInAt: new Date().toISOString() }
    currentUserSession = session
    savePersistedSession(session)
    return { success: true, user: { id: user.id, name: user.name, role: user.role, avatar_color: user.avatar_color } }
  })

  // First-launch only — guarded server-side (not just in the UI) so it can
  // never be used to mint an extra admin account after setup is done.
  ipcMain.handle('auth:bootstrap', (_, { name, mobile_number, password }) => {
    if (getAllUsers(db).some(u => u.role === 'admin')) {
      return { success: false, error: 'Setup already completed' }
    }
    const user = createUser(db, { name, role: 'admin', mobile_number, password_hash: bcrypt.hashSync(password, 10) })
    const session = { id: user.id, name: user.name, role: user.role, lastActivity: Date.now(), loggedInAt: new Date().toISOString() }
    currentUserSession = session
    savePersistedSession(session)
    return { success: true, user: { id: user.id, name: user.name, role: user.role, avatar_color: user.avatar_color } }
  })

  ipcMain.handle('auth:getSession', () => {
    if (!currentUserSession) currentUserSession = loadPersistedSession()
    if (!currentUserSession) return null
    // Auto-logout tracker after 30 min inactivity
    if (currentUserSession.role === 'tracker') {
      const inactivMs = Date.now() - currentUserSession.lastActivity
      if (inactivMs > 30 * 60 * 1000) {
        currentUserSession = null
        clearPersistedSession()
        return null
      }
    }
    return currentUserSession
  })

  ipcMain.handle('auth:logout', () => {
    currentUserSession = null
    clearPersistedSession()
    return { success: true }
  })

  ipcMain.handle('users:refreshActivity', () => {
    if (currentUserSession) currentUserSession.lastActivity = Date.now()
    return { success: true }
  })

  ipcMain.handle('users:getTrackerBudget', () => {
    const profile = db.prepare('SELECT tracker_monthly_budget FROM profile LIMIT 1').get()
    return profile?.tracker_monthly_budget || 0
  })

  ipcMain.handle('users:setTrackerBudget', (_, amount) => {
    db.prepare('UPDATE profile SET tracker_monthly_budget = ?').run(amount)
    return { success: true }
  })

  // ── Profile ──────────────────────────────────────────────────────────────
  ipcMain.handle('profile:get', () => {
    return db.prepare('SELECT * FROM profile LIMIT 1').get() ?? null
  })

  ipcMain.handle('profile:save', (_, data) => {
    const deviceId = getOrCreateDeviceId()
    const existing = db.prepare('SELECT id FROM profile LIMIT 1').get()
    if (existing) {
      db.prepare(
        `UPDATE profile SET name = ?, monthly_salary = ?, salary_updated_at = datetime('now'), date_of_birth = ?, retirement_age = ?, updated_at = datetime('now'), device_id = ? WHERE id = ?`
      ).run(data.name, data.monthly_salary, data.date_of_birth || null, data.retirement_age || 60, deviceId, existing.id)
      return { id: existing.id }
    }
    const result = db.prepare(
      `INSERT INTO profile (sync_id, name, monthly_salary, salary_updated_at, date_of_birth, retirement_age, updated_at, device_id) VALUES (?, ?, ?, datetime('now'), ?, ?, datetime('now'), ?)`
    ).run(randomUUID(), data.name, data.monthly_salary, data.date_of_birth || null, data.retirement_age || 60, deviceId)
    return { id: result.lastInsertRowid }
  })

  // ── Goals ─────────────────────────────────────────────────────────────────
  ipcMain.handle('goals:getAll', () => {
    return db.prepare('SELECT * FROM goals WHERE deleted_at IS NULL ORDER BY created_at DESC').all()
  })

  ipcMain.handle('goals:create', (_, d) => {
    const deviceId = getOrCreateDeviceId()
    const result = db.prepare(`
      INSERT INTO goals (sync_id, title, type, category, target_amount, current_amount, target_date,
        bank_or_provider, emoji, color, inflation_adjust, inflation_rate,
        monthly_emi, notes, device_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(), d.title, d.type, d.category ?? 'need', d.target_amount ?? 0, d.current_amount ?? 0,
      d.target_date ?? null, d.bank_or_provider ?? null,
      d.emoji ?? null, d.color ?? null, d.inflation_adjust ? 1 : 0, d.inflation_rate ?? 6,
      d.monthly_emi ?? 0, d.notes ?? null, deviceId
    )
    return { id: result.lastInsertRowid }
  })

  ipcMain.handle('goals:update', (_, d) => {
    const deviceId = getOrCreateDeviceId()
    db.prepare(`
      UPDATE goals SET title = ?, type = ?, category = ?, target_amount = ?, current_amount = ?,
        target_date = ?, bank_or_provider = ?, emoji = ?, color = ?,
        inflation_adjust = ?, inflation_rate = ?, monthly_emi = ?, notes = ?,
        is_achieved = ?, achieved_at = ?, updated_at = datetime('now'), device_id = ?
      WHERE id = ?
    `).run(
      d.title, d.type, d.category ?? 'need', d.target_amount ?? 0, d.current_amount ?? 0,
      d.target_date ?? null, d.bank_or_provider ?? null,
      d.emoji ?? null, d.color ?? null, d.inflation_adjust ? 1 : 0, d.inflation_rate ?? 6,
      d.monthly_emi ?? 0, d.notes ?? null,
      d.is_achieved ? 1 : 0, d.is_achieved ? (d.achieved_at || new Date().toISOString()) : null,
      deviceId, d.id
    )
    return { success: true }
  })

  ipcMain.handle('goals:delete', (_, id) => {
    const deviceId = getOrCreateDeviceId()
    // Soft delete — the schema's ON DELETE SET NULL / CASCADE only fire on a real
    // DELETE, so replicate that cleanup by hand: unlink any investments still
    // tagged to this goal and drop the (regenerable) junction rows.
    const tx = db.transaction(() => {
      db.prepare(`UPDATE goals SET deleted_at = datetime('now'), updated_at = datetime('now'), device_id = ? WHERE id = ?`)
        .run(deviceId, id)
      db.prepare(`UPDATE investments SET goal_id = NULL, last_updated_at = datetime('now'), device_id = ? WHERE goal_id = ?`)
        .run(deviceId, id)
      db.prepare('DELETE FROM goal_investments WHERE goal_id = ?').run(id)
    })
    tx()
    return { success: true }
  })

  // Auto-pull: refresh a goal's current_amount from the sum of ALL its linked investments'
  // current_value, logging the net delta as a single 'auto_linked' contribution.
  ipcMain.handle('goals:syncLinkedInvestment', (_, goalId) => {
    const result = syncGoalFromInvestments(db, goalId)
    return result
  })

  // ── Goal ↔ Investment links (many-to-many) ───────────────────────────────
  ipcMain.handle('goalInvestments:getForGoal', (_, goalId) => {
    return db.prepare(`
      SELECT i.* FROM goal_investments gi
      JOIN investments i ON i.id = gi.investment_id
      WHERE gi.goal_id = ? AND i.deleted_at IS NULL
      ORDER BY i.type, i.name
    `).all(goalId)
  })

  ipcMain.handle('goalInvestments:getAllLinks', () => {
    return db.prepare(`
      SELECT gi.goal_id as goal_id, i.*
      FROM goal_investments gi
      JOIN investments i ON i.id = gi.investment_id
      WHERE i.deleted_at IS NULL
      ORDER BY gi.goal_id, i.type, i.name
    `).all()
  })

  ipcMain.handle('goalInvestments:setForGoal', (_, { goalId, investmentIds }) => {
    const deviceId = getOrCreateDeviceId()
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM goal_investments WHERE goal_id = ?').run(goalId)
      const insert = db.prepare(`
        INSERT INTO goal_investments (sync_id, goal_id, investment_id, updated_at, device_id)
        VALUES (?, ?, ?, datetime('now'), ?)
      `)
      for (const investmentId of investmentIds || []) insert.run(randomUUID(), goalId, investmentId, deviceId)
    })
    tx()
    return { success: true }
  })

  // ── Goal Contributions ────────────────────────────────────────────────────
  ipcMain.handle('goalContributions:getAll', (_, goalId) => {
    return db.prepare(
      'SELECT * FROM goal_contributions WHERE goal_id = ? AND deleted_at IS NULL ORDER BY contributed_at DESC, id DESC'
    ).all(goalId)
  })

  ipcMain.handle('goalContributions:create', (_, d) => {
    const deviceId = getOrCreateDeviceId()
    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO goal_contributions (sync_id, goal_id, amount, note, contributed_at, contribution_type, updated_at, device_id)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)
      `).run(randomUUID(), d.goal_id, d.amount, d.note ?? null, d.contributed_at || new Date().toISOString(), d.contribution_type || 'manual', deviceId)
      db.prepare(`UPDATE goals SET current_amount = current_amount + ?, updated_at = datetime('now'), device_id = ? WHERE id = ?`)
        .run(d.amount, deviceId, d.goal_id)
    })
    tx()
    return { success: true }
  })

  ipcMain.handle('goalContributions:delete', (_, d) => {
    const deviceId = getOrCreateDeviceId()
    const tx = db.transaction(() => {
      db.prepare(`UPDATE goal_contributions SET deleted_at = datetime('now'), updated_at = datetime('now'), device_id = ? WHERE id = ?`)
        .run(deviceId, d.id)
      db.prepare(`UPDATE goals SET current_amount = current_amount - ?, updated_at = datetime('now'), device_id = ? WHERE id = ?`)
        .run(d.amount, deviceId, d.goal_id)
    })
    tx()
    return { success: true }
  })

  // ── Investments ───────────────────────────────────────────────────────────
  ipcMain.handle('investments:getAll', (_, goalId) => {
    autoApplySIPs(db)
    const norm = rows => rows.map(r => ({ ...r, sip_frequency: r.sip_frequency ?? 'monthly' }))
    if (goalId) {
      return norm(db.prepare(
        'SELECT * FROM investments WHERE goal_id = ? AND deleted_at IS NULL ORDER BY last_updated_at DESC'
      ).all(goalId))
    }
    return norm(db.prepare(`
      SELECT i.*, g.title as goal_title
      FROM investments i
      LEFT JOIN goals g ON i.goal_id = g.id
      WHERE i.deleted_at IS NULL
      ORDER BY i.last_updated_at DESC
    `).all())
  })

  ipcMain.handle('investments:create', (_, d) => {
    const deviceId = getOrCreateDeviceId()
    const result = db.prepare(`
      INSERT INTO investments (sync_id, name, type, provider, bank_or_amc, account_number,
        invested_amount, current_value, monthly_sip_amount, sip_frequency,
        start_date, maturity_date, goal_id, notes, units, purchase_price,
        scheme_code, interest_rate, ticker_symbol, exchange, purity, deposited_so_far, nps_equity_pct, sip_last_applied_at,
        created_at, device_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)
    `).run(
      randomUUID(), d.name, d.type, d.provider ?? null, d.bank_or_amc ?? null,
      d.account_number ?? null, d.invested_amount ?? 0, d.current_value ?? 0,
      d.monthly_sip_amount ?? 0, d.sip_frequency ?? 'monthly',
      d.start_date ?? null, d.maturity_date ?? null,
      d.goal_id ?? null, d.notes ?? null,
      d.units ?? 0, d.purchase_price ?? 0, d.scheme_code ?? null,
      d.interest_rate ?? 0, d.ticker_symbol ?? null,
      d.exchange ?? 'NSE', d.purity ?? '24K',
      d.deposited_so_far === '' || d.deposited_so_far === undefined ? null : d.deposited_so_far,
      d.type === 'nps' ? (d.nps_equity_pct === '' || d.nps_equity_pct == null ? 75 : d.nps_equity_pct) : null,
      deviceId
    )
    const investmentId = result.lastInsertRowid
    const newGoalId = d.goal_id ?? null
    if (newGoalId) {
      syncInvestmentGoalLink(db, investmentId, null, newGoalId)
      syncGoalFromInvestments(db, newGoalId)
    }
    return { id: investmentId }
  })

  ipcMain.handle('investments:update', (_, d) => {
    const before = db.prepare('SELECT goal_id FROM investments WHERE id = ?').get(d.id)
    const oldGoalId = before?.goal_id ?? null
    const newGoalId = d.goal_id ?? null
    const deviceId = getOrCreateDeviceId()

    db.prepare(`
      UPDATE investments SET name = ?, type = ?, provider = ?, bank_or_amc = ?,
        account_number = ?, invested_amount = ?, current_value = ?, monthly_sip_amount = ?,
        sip_frequency = ?, start_date = ?, maturity_date = ?, goal_id = ?, notes = ?,
        units = ?, purchase_price = ?, scheme_code = ?, interest_rate = ?,
        ticker_symbol = ?, exchange = ?, purity = ?, deposited_so_far = ?, nps_equity_pct = ?,
        last_updated_at = datetime('now'), device_id = ?
      WHERE id = ?
    `).run(
      d.name, d.type, d.provider ?? null, d.bank_or_amc ?? null,
      d.account_number ?? null, d.invested_amount, d.current_value,
      d.monthly_sip_amount ?? 0, d.sip_frequency ?? 'monthly',
      d.start_date ?? null, d.maturity_date ?? null,
      newGoalId, d.notes ?? null,
      d.units ?? 0, d.purchase_price ?? 0, d.scheme_code ?? null,
      d.interest_rate ?? 0, d.ticker_symbol ?? null,
      d.exchange ?? 'NSE', d.purity ?? '24K',
      d.deposited_so_far === '' || d.deposited_so_far === undefined ? null : d.deposited_so_far,
      d.type === 'nps' ? (d.nps_equity_pct === '' || d.nps_equity_pct == null ? 75 : d.nps_equity_pct) : null,
      deviceId, d.id
    )

    syncInvestmentGoalLink(db, d.id, oldGoalId, newGoalId)
    // Re-sync both the old goal (link removed/moved away) and the new one (link
    // added/value changed) so current_amount reflects this save immediately.
    if (oldGoalId && oldGoalId !== newGoalId) syncGoalFromInvestments(db, oldGoalId)
    if (newGoalId) syncGoalFromInvestments(db, newGoalId)

    return { success: true }
  })

  ipcMain.handle('investments:delete', (_, id) => {
    const deviceId = getOrCreateDeviceId()
    const linkedGoalIds = db.prepare('SELECT DISTINCT goal_id FROM goal_investments WHERE investment_id = ?').all(id).map(r => r.goal_id)
    // Soft delete — a real DELETE would never propagate to the other device's
    // Drive merge. Junction rows aren't independently synced state (they're
    // regenerated wholesale by the goal/investment forms), so those still
    // get hard-removed here, same as before.
    const tx = db.transaction(() => {
      db.prepare(`UPDATE investments SET deleted_at = datetime('now'), last_updated_at = datetime('now'), device_id = ? WHERE id = ?`)
        .run(deviceId, id)
      db.prepare('DELETE FROM goal_investments WHERE investment_id = ?').run(id)
    })
    tx()
    for (const goalId of linkedGoalIds) {
      try { syncGoalFromInvestments(db, goalId) } catch (e) { console.error('Post-delete goal sync failed for goal', goalId, e) }
    }
    return { success: true }
  })

  // Goals a specific investment is currently linked to — used by the Edit
  // Investment form to pre-select the "Link to Goal" dropdown from the source
  // of truth (goal_investments) rather than the investment's own goal_id column.
  ipcMain.handle('goalInvestments:getForInvestment', (_, investmentId) => {
    return db.prepare('SELECT goal_id FROM goal_investments WHERE investment_id = ?').all(investmentId).map(r => r.goal_id)
  })

  // ── External price / NAV APIs (called from main to avoid CORS) ────────────
  ipcMain.handle('api:searchMF', async (_, query) => {
    const url = `https://api.mfapi.in/mf/search?q=${encodeURIComponent(query)}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`MF search failed: ${res.status}`)
    return res.json()
  })

  ipcMain.handle('api:fetchMFNav', async (_, schemeCode) => {
    const res = await fetch(`https://api.mfapi.in/mf/${schemeCode}/latest`)
    if (!res.ok) throw new Error(`NAV fetch failed: ${res.status}`)
    const body = await res.json()
    const nav = parseFloat(body.data?.[0]?.nav)
    if (!nav) throw new Error('NAV not found in response')
    return { nav, date: body.data?.[0]?.date, name: body.meta?.scheme_name }
  })

  ipcMain.handle('api:fetchStockPrice', async (_, symbol, exchange) => {
    const suffix = exchange === 'BSE' ? '.BO' : '.NS'
    const ticker = `${symbol.trim().toUpperCase()}${suffix}`
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 WealthLens/1.0' } })
    if (!res.ok) throw new Error(`Yahoo Finance error: ${res.status}`)
    const body = await res.json()
    const meta = body.chart?.result?.[0]?.meta
    if (!meta?.regularMarketPrice) throw new Error('Price not found')
    return { price: meta.regularMarketPrice, currency: meta.currency, symbol: meta.symbol }
  })

  ipcMain.handle('api:fetchGoldPrice', async () => {
    const headers = { 'User-Agent': 'Mozilla/5.0 WealthLens/1.0' }
    const [goldRes, fxRes] = await Promise.all([
      fetch('https://query2.finance.yahoo.com/v8/finance/chart/GC=F?interval=1d&range=1d', { headers }),
      fetch('https://query2.finance.yahoo.com/v8/finance/chart/USDINR=X?interval=1d&range=1d', { headers }),
    ])
    if (!goldRes.ok || !fxRes.ok) throw new Error('Gold/FX price fetch failed')
    const [goldBody, fxBody] = await Promise.all([goldRes.json(), fxRes.json()])
    const goldUSD = goldBody.chart?.result?.[0]?.meta?.regularMarketPrice
    const usdInr  = fxBody.chart?.result?.[0]?.meta?.regularMarketPrice
    if (!goldUSD || !usdInr) throw new Error('Could not parse gold or FX price')
    // GC=F is USD per troy oz; 1 troy oz = 31.1035 g
    const inrPerGram = (goldUSD * usdInr) / 31.1035
    return { inrPerGram: Math.round(inrPerGram), goldUSD, usdInr }
  })

  // ── Salary Allocations ────────────────────────────────────────────────────
  ipcMain.handle('salary:getAllocations', () => {
    return db.prepare('SELECT * FROM salary_allocations ORDER BY created_at ASC').all()
  })

  ipcMain.handle('salary:createAllocation', (_, d) => {
    const result = db.prepare(`
      INSERT INTO salary_allocations (category, label, percentage, amount, provider, bank, color)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      d.category, d.label, d.percentage ?? 0, d.amount ?? 0,
      d.provider ?? null, d.bank ?? null, d.color ?? null
    )
    return { id: result.lastInsertRowid }
  })

  ipcMain.handle('salary:updateAllocation', (_, d) => {
    db.prepare(`
      UPDATE salary_allocations
      SET category = ?, label = ?, percentage = ?, amount = ?, provider = ?, bank = ?, color = ?
      WHERE id = ?
    `).run(d.category, d.label, d.percentage, d.amount, d.provider ?? null, d.bank ?? null, d.color ?? null, d.id)
    return { success: true }
  })

  ipcMain.handle('salary:deleteAllocation', (_, id) => {
    db.prepare('DELETE FROM salary_allocations WHERE id = ?').run(id)
    return { success: true }
  })

  // Atomically replace all salary allocations (used by SalaryAllocator save)
  ipcMain.handle('salary:replaceAll', (_, { salary, rows }) => {
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM salary_allocations').run()
      const insert = db.prepare(`
        INSERT INTO salary_allocations (category, label, percentage, amount, provider, bank, color)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      for (const r of rows) {
        insert.run(
          r.category, r.label, r.percentage ?? 0, r.amount ?? 0,
          r.provider ?? null, r.bank ?? null, r.color ?? null
        )
      }
      // Also update salary in profile (upsert)
      const existing = db.prepare('SELECT id FROM profile LIMIT 1').get()
      if (existing) {
        db.prepare(`UPDATE profile SET monthly_salary = ?, salary_updated_at = datetime('now') WHERE id = ?`)
          .run(salary, existing.id)
      } else {
        db.prepare(`INSERT INTO profile (name, monthly_salary, salary_updated_at) VALUES ('', ?, datetime('now'))`)
          .run(salary)
      }
    })
    tx()
    return { success: true }
  })

  // ── Salary Plans ──────────────────────────────────────────────────────────
  function planWithItems(plan) {
    if (!plan) return null
    const items = db.prepare(
      'SELECT * FROM salary_plan_items WHERE plan_id = ? ORDER BY sort_order'
    ).all(plan.id)
    return { ...plan, items }
  }

  function planSummary(plan) {
    const items = db.prepare(
      'SELECT category, SUM(amount) as total FROM salary_plan_items WHERE plan_id = ? GROUP BY category'
    ).all(plan.id)
    const bycat = {}
    for (const r of items) bycat[r.category] = r.total
    return {
      ...plan,
      totalNeeds: bycat.needs || 0,
      totalWants: bycat.wants || 0,
      totalInvestment: bycat.investment || 0,
      itemCount: db.prepare('SELECT COUNT(*) as c FROM salary_plan_items WHERE plan_id = ?').get(plan.id).c,
    }
  }

  ipcMain.handle('plans:getAll', () => {
    const plans = db.prepare('SELECT * FROM salary_plans ORDER BY effective_from DESC').all()
    return plans.map(planSummary)
  })

  ipcMain.handle('plans:getActive', () => {
    const plan = db.prepare('SELECT * FROM salary_plans WHERE is_active = 1 LIMIT 1').get()
    return planWithItems(plan)
  })

  ipcMain.handle('plans:getById', (_, id) => {
    const plan = db.prepare('SELECT * FROM salary_plans WHERE id = ?').get(id)
    return planWithItems(plan)
  })

  ipcMain.handle('plans:create', (_, { label, monthly_salary, effective_from, notes, items }) => {
    const deviceId = getOrCreateDeviceId()
    const tx = db.transaction(() => {
      // Close current active plan
      const active = db.prepare('SELECT id FROM salary_plans WHERE is_active = 1 LIMIT 1').get()
      if (active) {
        const prevDay = new Date(new Date(effective_from).getTime() - 86_400_000)
          .toISOString().slice(0, 10)
        db.prepare(`UPDATE salary_plans SET is_active = 0, effective_to = ?, updated_at = datetime('now'), device_id = ? WHERE id = ?`)
          .run(prevDay, deviceId, active.id)
      }
      // Insert new plan
      const { lastInsertRowid: planId } = db.prepare(
        `INSERT INTO salary_plans (sync_id, label, monthly_salary, effective_from, is_active, notes, updated_at, device_id)
         VALUES (?, ?, ?, ?, 1, ?, datetime('now'), ?)`
      ).run(randomUUID(), label, monthly_salary, effective_from, notes ?? null, deviceId)
      // Insert items
      const ins = db.prepare(`
        INSERT INTO salary_plan_items (sync_id, plan_id, name, amount, category, bank_or_provider, sort_order, updated_at, device_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
      `)
      ;(items || []).forEach((it, i) => {
        ins.run(randomUUID(), planId, it.name, it.amount, it.category, it.bank_or_provider ?? null, i, deviceId)
      })
      // Update profile salary
      const prof = db.prepare('SELECT id FROM profile LIMIT 1').get()
      if (prof) {
        db.prepare(`UPDATE profile SET monthly_salary = ?, salary_updated_at = datetime('now'), updated_at = datetime('now'), device_id = ? WHERE id = ?`)
          .run(monthly_salary, deviceId, prof.id)
      } else {
        db.prepare(`INSERT INTO profile (sync_id, name, monthly_salary, salary_updated_at, updated_at, device_id) VALUES (?, '', ?, datetime('now'), datetime('now'), ?)`)
          .run(randomUUID(), monthly_salary, deviceId)
      }
      return planId
    })
    return { id: tx() }
  })

  ipcMain.handle('plans:updateItems', (_, { planId, items, monthly_salary, label }) => {
    const deviceId = getOrCreateDeviceId()
    db.transaction(() => {
      if (label != null)
        db.prepare(`UPDATE salary_plans SET label = ?, updated_at = datetime('now'), device_id = ? WHERE id = ?`).run(label, deviceId, planId)
      if (monthly_salary != null) {
        db.prepare(`UPDATE salary_plans SET monthly_salary = ?, updated_at = datetime('now'), device_id = ? WHERE id = ?`)
          .run(monthly_salary, deviceId, planId)
        const prof = db.prepare('SELECT id FROM profile LIMIT 1').get()
        if (prof) {
          db.prepare(`UPDATE profile SET monthly_salary = ?, salary_updated_at = datetime('now'), updated_at = datetime('now'), device_id = ? WHERE id = ?`)
            .run(monthly_salary, deviceId, prof.id)
        }
      }
      db.prepare('DELETE FROM salary_plan_items WHERE plan_id = ?').run(planId)
      const ins = db.prepare(`
        INSERT INTO salary_plan_items (sync_id, plan_id, name, amount, category, bank_or_provider, sort_order, updated_at, device_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
      `)
      ;(items || []).forEach((it, i) => {
        ins.run(randomUUID(), planId, it.name, it.amount, it.category, it.bank_or_provider ?? null, i, deviceId)
      })
    })()
    return { success: true }
  })

  // ── FIRE Planner ──────────────────────────────────────────────────────────
  ipcMain.handle('fire:getSettings', () => {
    const row = db.prepare('SELECT * FROM fire_planner_settings ORDER BY id DESC LIMIT 1').get()
    if (!row) return null
    return {
      ...row,
      loans_json: row.loans_json ? JSON.parse(row.loans_json) : [],
      future_expenses_json: row.future_expenses_json ? JSON.parse(row.future_expenses_json) : [],
      lump_sums_json: row.lump_sums_json ? JSON.parse(row.lump_sums_json) : [],
      additional_instruments_json: row.additional_instruments_json ? JSON.parse(row.additional_instruments_json) : [],
    }
  })

  ipcMain.handle('fire:saveSettings', (_, d) => {
    const existing = db.prepare('SELECT id FROM fire_planner_settings ORDER BY id DESC LIMIT 1').get()
    const params = [
      d.fire_type ?? 'regular', d.fi_multiple ?? null, d.sip_step_up_pct ?? 10,
      d.expense_no_kids ?? 0, d.expense_one_kid ?? 0, d.expense_two_kids ?? 0,
      d.kids_planned ?? 0, d.kid1_year ?? null, d.kid2_year ?? null,
      d.inflation_pct ?? 6, d.barista_income ?? null,
      JSON.stringify(d.loans_json ?? []),
      JSON.stringify(d.future_expenses_json ?? []),
      JSON.stringify(d.lump_sums_json ?? []),
      JSON.stringify(d.additional_instruments_json ?? []),
    ]
    if (existing) {
      db.prepare(`
        UPDATE fire_planner_settings SET
          fire_type = ?, fi_multiple = ?, sip_step_up_pct = ?,
          expense_no_kids = ?, expense_one_kid = ?, expense_two_kids = ?,
          kids_planned = ?, kid1_year = ?, kid2_year = ?,
          inflation_pct = ?, barista_income = ?,
          loans_json = ?, future_expenses_json = ?, lump_sums_json = ?,
          additional_instruments_json = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(...params, existing.id)
      return { id: existing.id }
    }
    const result = db.prepare(`
      INSERT INTO fire_planner_settings (
        fire_type, fi_multiple, sip_step_up_pct,
        expense_no_kids, expense_one_kid, expense_two_kids,
        kids_planned, kid1_year, kid2_year,
        inflation_pct, barista_income,
        loans_json, future_expenses_json, lump_sums_json,
        additional_instruments_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(...params)
    return { id: result.lastInsertRowid }
  })

  // ── Expenses ──────────────────────────────────────────────────────────────
  ipcMain.handle('expenses:getAll', (_, filter = {}) => {
    let query = 'SELECT e.*, u.name as logged_by_name FROM expenses e LEFT JOIN users u ON e.logged_by_user_id = u.id WHERE e.deleted_at IS NULL'
    const params = []
    // filter.month is a 'YYYY-MM' string
    if (filter?.month) {
      query += " AND strftime('%Y-%m', e.date) = ?"
      params.push(filter.month)
    }
    if (filter?.logged_by) {
      query += ' AND e.logged_by_user_id = ?'
      params.push(filter.logged_by)
    }
    query += ' ORDER BY e.date DESC, e.created_at DESC'
    return db.prepare(query).all(...params)
  })

  ipcMain.handle('expenses:create', (_, d) => {
    const syncId   = generateExpenseSyncId()
    const deviceId = getOrCreateDeviceId()
    const result  = db.prepare(`
      INSERT INTO expenses (sync_id, amount, category, note, date, logged_by_user_id, updated_at, device_id)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)
    `).run(syncId, d.amount, d.category, d.note ?? null, d.date, currentUserSession?.id ?? null, deviceId)
    // Auto-push to Drive in background (fire and forget)
    const { connected } = getDriveStatus()
    if (connected) {
      getAllExpensesForSync(db)
      pushExpensesSync(getAllExpensesForSync(db), deviceId).catch(() => {})
    }
    return { id: result.lastInsertRowid }
  })

  ipcMain.handle('expenses:update', (_, d) => {
    const deviceId = getOrCreateDeviceId()
    db.prepare(`
      UPDATE expenses SET amount = ?, category = ?, note = ?, date = ?, updated_at = datetime('now'), device_id = ? WHERE id = ?
    `).run(d.amount, d.category, d.note ?? null, d.date, deviceId, d.id)
    return { success: true }
  })

  ipcMain.handle('expenses:delete', (_, id) => {
    const deviceId = getOrCreateDeviceId()
    // Soft delete — a hard DELETE here would never make it to the other device's
    // Drive merge, and the row would silently reappear on their next sync.
    db.prepare(`UPDATE expenses SET deleted_at = datetime('now'), updated_at = datetime('now'), device_id = ? WHERE id = ?`)
      .run(deviceId, id)
    return { success: true }
  })

  ipcMain.handle('expenses:getCategories', () => {
    return db.prepare(
      'SELECT * FROM expense_categories ORDER BY is_default DESC, name ASC'
    ).all()
  })

  ipcMain.handle('expenses:createCategory', (_, d) => {
    const result = db.prepare(`
      INSERT INTO expense_categories (name, icon, color, is_default) VALUES (?, ?, ?, 0)
    `).run(d.name, d.icon ?? null, d.color ?? null)
    return { id: result.lastInsertRowid }
  })

  ipcMain.handle('drive:syncPush', async () => {
    const deviceId = getOrCreateDeviceId()
    const expenses = getAllExpensesForSync(db)
    await pushExpensesSync(expenses, deviceId)
    return { success: true, count: expenses.length }
  })

  ipcMain.handle('drive:syncPull', async () => {
    const deviceId       = getOrCreateDeviceId()
    const remoteExpenses = await pullExpensesSync(deviceId)
    const merged         = mergeExpensesFromSync(db, remoteExpenses)
    // Push own data back so the other device also gets it next time they sync
    if (remoteExpenses.length > 0) {
      pushExpensesSync(getAllExpensesForSync(db), deviceId).catch(() => {})
    }
    return { success: true, merged, total: remoteExpenses.length }
  })

  // ── Unified row-level sync (all tables, single WealthLens_sync.json) ──────
  ipcMain.handle('sync:now', () => performFullSync(db))
  ipcMain.handle('sync:getLog', () => getSyncLog(db, 20))
  ipcMain.handle('sync:getDeviceId', () => getOrCreateDeviceId())

  ipcMain.handle('expenses:deleteCategory', (_, id) => {
    db.prepare('DELETE FROM expense_categories WHERE id = ? AND is_default = 0').run(id)
    return { success: true }
  })

  ipcMain.handle('expenses:getMonthlyStats', (_, filter) => {
    const month = String(filter.month).padStart(2, '0')
    const year  = String(filter.year)
    const rows  = db.prepare(
      `SELECT * FROM expenses WHERE strftime('%m', date) = ? AND strftime('%Y', date) = ?`
    ).all(month, year)

    const total = rows.reduce((s, r) => s + r.amount, 0)

    const catMap = {}
    for (const r of rows) catMap[r.category] = (catMap[r.category] || 0) + r.amount
    const byCategory = Object.entries(catMap)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)

    const daysInMonth = new Date(Number(year), Number(month), 0).getDate()
    const dailyAvg = rows.length ? total / daysInMonth : 0

    const dayMap = {}
    for (const r of rows) dayMap[r.date] = (dayMap[r.date] || 0) + r.amount
    const topDayEntry = Object.entries(dayMap).sort((a, b) => b[1] - a[1])[0]

    return {
      total,
      byCategory,
      dailyAvg,
      topDay: topDayEntry ? { date: topDayEntry[0], amount: topDayEntry[1] } : null,
    }
  })

  // ── Dashboard stats ───────────────────────────────────────────────────────
  // Mirrors GET /api/dashboard/stats (src/server/routes/dashboard.js) — same
  // role scoping: expenses combined for admin / own-only for tracker, weight
  // always own, investments/goals admin-only.
  ipcMain.handle('dashboard:getStats', () => {
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const today = now.toISOString().slice(0, 10)
    const isAdmin = currentUserSession?.role === 'admin'
    const userId = currentUserSession?.id

    let expQuery = `
      SELECT e.*, u.name as logged_by_name FROM expenses e
      LEFT JOIN users u ON e.logged_by_user_id = u.id
      WHERE e.deleted_at IS NULL AND date LIKE ?`
    const expParams = [`${month}%`]
    if (!isAdmin) {
      expQuery += ' AND e.logged_by_user_id = ?'
      expParams.push(userId)
    }
    expQuery += ' ORDER BY e.date ASC, e.created_at ASC'
    const monthExpenses = db.prepare(expQuery).all(...expParams)

    const thisMonthSpend = monthExpenses.reduce((sum, e) => sum + e.amount, 0)
    const todayExpenses = monthExpenses.filter(e => e.date === today)

    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const byDay = {}
    for (const e of monthExpenses) byDay[e.date] = (byDay[e.date] || 0) + e.amount
    const dailySpend = Array.from({ length: daysInMonth }, (_, i) => {
      const date = `${month}-${String(i + 1).padStart(2, '0')}`
      return { date, amount: byDay[date] || 0 }
    })

    const activePlan = db.prepare('SELECT id FROM salary_plans WHERE is_active = 1 LIMIT 1').get()
    let monthlyBudget = 0
    if (activePlan) {
      const { total } = db.prepare(
        "SELECT COALESCE(SUM(amount), 0) as total FROM salary_plan_items WHERE plan_id = ? AND category IN ('needs', 'wants')"
      ).get(activePlan.id)
      monthlyBudget = total
    }

    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10)
    const weightLogs = userId
      ? db.prepare('SELECT * FROM weight_logs WHERE user_id = ? AND date >= ? ORDER BY date ASC').all(userId, thirtyDaysAgo)
      : []
    const latestWeight = weightLogs.length ? weightLogs[weightLogs.length - 1].weight_kg : null
    const heightCm = userId ? (db.prepare('SELECT height_cm FROM users WHERE id = ?').get(userId)?.height_cm || 0) : 0

    let totalInvested = 0, netWorth = 0, activeGoals = 0
    if (isAdmin) {
      const inv = db.prepare(
        'SELECT COALESCE(SUM(invested_amount), 0) as invested, COALESCE(SUM(current_value), 0) as value FROM investments WHERE deleted_at IS NULL'
      ).get()
      totalInvested = inv.invested
      netWorth = inv.value
      const { c } = db.prepare('SELECT COUNT(*) as c FROM goals WHERE deleted_at IS NULL AND is_achieved = 0').get()
      activeGoals = c
    }

    return {
      thisMonthSpend, monthlyBudget, dailySpend, todayExpenses,
      latestWeight, weightLogs, heightCm, totalInvested, activeGoals, netWorth,
    }
  })

  // ── Google Drive ──────────────────────────────────────────────────────────
  ipcMain.handle('drive:getStatus',       ()              => getDriveStatus())
  ipcMain.handle('drive:getSyncStatus',   ()              => getSyncStatus(dbPath))
  ipcMain.handle('drive:getDbLastModified', ()            => getDbLastModified(dbPath))
  ipcMain.handle('drive:hasCreds',        ()              => Boolean(getStoredCreds()))
  ipcMain.handle('drive:getCreds',        ()              => getStoredCreds() || null)
  ipcMain.handle('drive:saveCredentials', (_, id, secret) => { saveCreds(id, secret); return { success: true } })

  ipcMain.handle('drive:getInstalledBrowsers', () => {
    const browsers = [{ name: 'System Default', app: null, icon: '🌐' }]
    if (process.platform === 'darwin') {
      const candidates = [
        { name: 'Safari',          app: 'Safari',          path: '/Applications/Safari.app',                   icon: '🧭' },
        { name: 'Chrome',          app: 'Google Chrome',   path: '/Applications/Google Chrome.app',            icon: '🟡' },
        { name: 'Firefox',         app: 'Firefox',         path: '/Applications/Firefox.app',                  icon: '🦊' },
        { name: 'Edge',            app: 'Microsoft Edge',  path: '/Applications/Microsoft Edge.app',           icon: '📘' },
        { name: 'Brave',           app: 'Brave Browser',   path: '/Applications/Brave Browser.app',            icon: '🦁' },
        { name: 'Arc',             app: 'Arc',             path: '/Applications/Arc.app',                      icon: '🌈' },
        { name: 'Opera',           app: 'Opera',           path: '/Applications/Opera.app',                    icon: '🔴' },
        { name: 'Vivaldi',         app: 'Vivaldi',         path: '/Applications/Vivaldi.app',                  icon: '🎵' },
      ]
      candidates.forEach(b => { if (existsSync(b.path)) browsers.push(b) })
    }
    return browsers
  })

  ipcMain.handle('drive:connect', async (_, browserApp = null) => {
    const creds = getStoredCreds()
    if (!creds) throw new Error('No credentials saved — call drive:saveCredentials first')
    return initiateAuth(creds.clientId, creds.clientSecret, browserApp)
  })
  ipcMain.handle('drive:disconnect',      ()              => { driveDisconnect(); return { success: true } })
  ipcMain.handle('drive:backup',          async ()        => backupDatabase(dbPath))
  ipcMain.handle('drive:listBackups',     async ()        => listBackups())
  ipcMain.handle('drive:restore',         async (_, fileId) => {
    await restoreFromDrive(fileId, dbPath)
    // Restart the app so fresh data is loaded from the restored database
    setTimeout(() => { app.relaunch(); app.exit(0) }, 600)
    return { success: true }
  })
  ipcMain.handle('drive:getAutoBackup',   ()              => getAppSettings().autoBackup)
  ipcMain.handle('drive:setAutoBackup',   (_, val)        => {
    saveAppSettings({ ...getAppSettings(), autoBackup: Boolean(val) })
    return { success: true }
  })

  // ── Weight Logs ────────────────────────────────────────────────────────────
  ipcMain.handle('weight:log', (_, { userId, weightKg, date, note }) => {
    db.prepare(`
      INSERT INTO weight_logs (user_id, weight_kg, date, note)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, date) DO UPDATE SET
        weight_kg = excluded.weight_kg,
        note = excluded.note,
        created_at = datetime('now')
    `).run(userId, weightKg, date, note ?? null)
    return { success: true }
  })

  ipcMain.handle('weight:getAll', (_, { userId, from, to } = {}) => {
    let query = 'SELECT * FROM weight_logs WHERE user_id = ?'
    const params = [userId]
    if (from) { query += ' AND date >= ?'; params.push(from) }
    if (to)   { query += ' AND date <= ?'; params.push(to)   }
    query += ' ORDER BY date ASC'
    return db.prepare(query).all(...params)
  })

  ipcMain.handle('weight:delete', (_, id) => {
    db.prepare('DELETE FROM weight_logs WHERE id = ?').run(id)
    return { success: true }
  })

  ipcMain.handle('weight:saveProfile', (_, { userId, heightCm, dateOfBirth }) => {
    db.prepare('UPDATE users SET height_cm = ?, date_of_birth = ? WHERE id = ?').run(heightCm, dateOfBirth ?? null, userId)
    return { success: true }
  })

  ipcMain.handle('weight:getProfile', (_, userId) => {
    return db.prepare('SELECT height_cm, date_of_birth FROM users WHERE id = ?').get(userId)
  })

  ipcMain.handle('weight:getAllForAdmin', () => {
    return db.prepare(`
      SELECT wl.*, u.name AS user_name, u.role AS user_role, u.height_cm, u.date_of_birth
      FROM weight_logs wl
      JOIN users u ON wl.user_id = u.id
      ORDER BY wl.date DESC, wl.created_at DESC
    `).all()
  })

  ipcMain.handle('weight:getUsersWithProfile', () => {
    return db.prepare(
      'SELECT id, name, role, avatar_color, height_cm, date_of_birth FROM users ORDER BY role DESC'
    ).all()
  })

  ipcMain.handle('phone:import', (_, filePath, userId) => {
    const content = readFileSync(filePath, 'utf8')
    const data = JSON.parse(content)

    let targetUser
    if (userId) {
      targetUser = db.prepare('SELECT id FROM users WHERE id=?').get(userId)
    }
    if (!targetUser) {
      targetUser = db.prepare("SELECT id FROM users WHERE role='tracker'").get()
    }
    if (!targetUser) throw new Error('No target user found')

    let expensesImported = 0
    let weightImported = 0

    if (Array.isArray(data.expenses)) {
      const insert = db.prepare(`
        INSERT OR IGNORE INTO expenses (sync_id, amount, category, note, date, logged_by, created_at)
        VALUES (@sync_id, @amount, @category, @note, @date, @logged_by, @created_at)
      `)
      for (const exp of data.expenses) {
        if (!exp.sync_id) continue
        const result = insert.run({
          sync_id: exp.sync_id, amount: exp.amount, category: exp.category,
          note: exp.note || null, date: exp.date, logged_by: targetUser.id,
          created_at: exp.created_at || new Date().toISOString(),
        })
        if (result.changes) expensesImported++
      }
    }

    if (Array.isArray(data.weight_logs)) {
      const upsert = db.prepare(`
        INSERT INTO weight_logs (user_id, weight_kg, date, note)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, date) DO UPDATE SET weight_kg=excluded.weight_kg, note=excluded.note
      `)
      for (const log of data.weight_logs) {
        try { upsert.run(targetUser.id, log.weight_kg, log.date, log.note || null); weightImported++ } catch {}
      }
    }

    return { expensesImported, weightImported }
  })

  // Rebalancing actions
  ipcMain.handle('rebalancing:getAll', () => {
    return db.prepare('SELECT * FROM rebalancing_actions ORDER BY created_at DESC').all()
  })

  ipcMain.handle('rebalancing:upsert', (_, suggestionText, status) => {
    const existing = db.prepare('SELECT id FROM rebalancing_actions WHERE suggestion_text = ?').get(suggestionText)
    if (existing) {
      db.prepare(
        `UPDATE rebalancing_actions SET status = ?, completed_at = CASE WHEN ? = 'done' THEN datetime('now') ELSE NULL END WHERE id = ?`
      ).run(status, status, existing.id)
      return { id: existing.id }
    }
    const result = db.prepare(
      `INSERT INTO rebalancing_actions (suggestion_text, status, completed_at) VALUES (?, ?, CASE WHEN ? = 'done' THEN datetime('now') ELSE NULL END)`
    ).run(suggestionText, status, status)
    return { id: result.lastInsertRowid }
  })
}
