import { app, BrowserWindow, ipcMain, shell, safeStorage } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { pbkdf2Sync, randomBytes } from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import bcrypt from 'bcryptjs'
import {
  initDatabase, getDb,
  getAllUsers, getAllUsersWithHash, getUserById, updateUser, updateUserPin, updateUserLastLogin,
  generateExpenseSyncId, getAllExpensesForSync, mergeExpensesFromSync,
} from '../db/database.js'
import {
  initiateAuth, disconnect as driveDisconnect, backupDatabase, listBackups,
  restoreFromDrive, getDriveStatus, getSyncStatus, getDbLastModified,
  getStoredCreds, saveCreds, getAppSettings, saveAppSettings,
  getOrCreateDeviceId, pushExpensesSync, pullExpensesSync,
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

// ── Auth session state (in-memory; resets every app restart) ─────────────
let sessionUnlocked   = false
let authFailedAttempts = 0
let authLockoutUntil   = 0

// ── User session (replaces single-password lock for role-based access) ────
let currentUserSession = null // { id, name, role, lastActivity }

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
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', async () => {
  const settings = getAppSettings()
  if (!settings.autoBackup) return
  const creds = getStoredCreds()
  if (!creds) return
  try { await backupDatabase(dbPath) } catch {}
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Credits elapsed SIP periods (monthly or weekly) to invested_amount and current_value.
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
        current_value        = current_value   + ?,
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
      applyUpdate.run(addition, addition, inv.id)
    }
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

  ipcMain.handle('users:verifyPin', (_, { userId, pin }) => {
    const user = getUserById(db, userId)
    if (!user) return { success: false, error: 'User not found' }
    const match = bcrypt.compareSync(pin, user.pin_hash)
    if (!match) return { success: false }
    updateUserLastLogin(db, userId)
    currentUserSession = { id: user.id, name: user.name, role: user.role, lastActivity: Date.now() }
    return { success: true, user: { id: user.id, name: user.name, role: user.role, avatar_color: user.avatar_color } }
  })

  ipcMain.handle('users:verifyPinAny', (_, pin) => {
    const users = getAllUsersWithHash(db)
    for (const user of users) {
      if (bcrypt.compareSync(pin, user.pin_hash)) {
        updateUserLastLogin(db, user.id)
        currentUserSession = { id: user.id, name: user.name, role: user.role, lastActivity: Date.now() }
        return { success: true, user: { id: user.id, name: user.name, role: user.role, avatar_color: user.avatar_color } }
      }
    }
    return { success: false }
  })

  ipcMain.handle('users:updateProfile', (_, { id, name, avatar_color }) => {
    updateUser(db, { id, name, avatar_color })
    return { success: true }
  })

  ipcMain.handle('users:updatePin', (_, { id, newPin }) => {
    const hash = bcrypt.hashSync(newPin, 10)
    updateUserPin(db, id, hash)
    return { success: true }
  })

  ipcMain.handle('users:getCurrentSession', () => {
    if (!currentUserSession) return null
    // Auto-logout tracker after 30 min inactivity
    if (currentUserSession.role === 'tracker') {
      const inactivMs = Date.now() - currentUserSession.lastActivity
      if (inactivMs > 30 * 60 * 1000) {
        currentUserSession = null
        return null
      }
    }
    return currentUserSession
  })

  ipcMain.handle('users:signOut', () => {
    currentUserSession = null
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
    const existing = db.prepare('SELECT id FROM profile LIMIT 1').get()
    if (existing) {
      db.prepare(
        `UPDATE profile SET name = ?, monthly_salary = ?, salary_updated_at = datetime('now'), date_of_birth = ?, retirement_age = ? WHERE id = ?`
      ).run(data.name, data.monthly_salary, data.date_of_birth || null, data.retirement_age || 60, existing.id)
      return { id: existing.id }
    }
    const result = db.prepare(
      `INSERT INTO profile (name, monthly_salary, salary_updated_at, date_of_birth, retirement_age) VALUES (?, ?, datetime('now'), ?, ?)`
    ).run(data.name, data.monthly_salary, data.date_of_birth || null, data.retirement_age || 60)
    return { id: result.lastInsertRowid }
  })

  // ── Goals ─────────────────────────────────────────────────────────────────
  ipcMain.handle('goals:getAll', () => {
    return db.prepare('SELECT * FROM goals ORDER BY created_at DESC').all()
  })

  ipcMain.handle('goals:create', (_, d) => {
    const result = db.prepare(`
      INSERT INTO goals (title, type, target_amount, current_amount_today, inflation_rate,
        target_year, target_age, emoji, color)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      d.title, d.type, d.target_amount, d.current_amount_today ?? 0,
      d.inflation_rate ?? 6, d.target_year ?? null, d.target_age ?? null,
      d.emoji ?? null, d.color ?? null
    )
    return { id: result.lastInsertRowid }
  })

  ipcMain.handle('goals:update', (_, d) => {
    db.prepare(`
      UPDATE goals SET title = ?, type = ?, target_amount = ?, current_amount_today = ?,
        inflation_rate = ?, target_year = ?, target_age = ?, emoji = ?, color = ?, is_achieved = ?
      WHERE id = ?
    `).run(
      d.title, d.type, d.target_amount, d.current_amount_today,
      d.inflation_rate, d.target_year ?? null, d.target_age ?? null,
      d.emoji ?? null, d.color ?? null, d.is_achieved ? 1 : 0, d.id
    )
    return { success: true }
  })

  ipcMain.handle('goals:delete', (_, id) => {
    db.prepare('DELETE FROM goals WHERE id = ?').run(id)
    return { success: true }
  })

  // ── Investments ───────────────────────────────────────────────────────────
  ipcMain.handle('investments:getAll', (_, goalId) => {
    autoApplySIPs(db)
    const norm = rows => rows.map(r => ({ ...r, sip_frequency: r.sip_frequency ?? 'monthly' }))
    if (goalId) {
      return norm(db.prepare(
        'SELECT * FROM investments WHERE goal_id = ? ORDER BY last_updated_at DESC'
      ).all(goalId))
    }
    return norm(db.prepare(`
      SELECT i.*, g.title as goal_title
      FROM investments i
      LEFT JOIN goals g ON i.goal_id = g.id
      ORDER BY i.last_updated_at DESC
    `).all())
  })

  ipcMain.handle('investments:create', (_, d) => {
    const result = db.prepare(`
      INSERT INTO investments (name, type, provider, bank_or_amc, account_number,
        invested_amount, current_value, monthly_sip_amount, sip_frequency,
        start_date, maturity_date, goal_id, notes, units, purchase_price,
        scheme_code, interest_rate, ticker_symbol, exchange, purity, sip_last_applied_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      d.name, d.type, d.provider ?? null, d.bank_or_amc ?? null,
      d.account_number ?? null, d.invested_amount ?? 0, d.current_value ?? 0,
      d.monthly_sip_amount ?? 0, d.sip_frequency ?? 'monthly',
      d.start_date ?? null, d.maturity_date ?? null,
      d.goal_id ?? null, d.notes ?? null,
      d.units ?? 0, d.purchase_price ?? 0, d.scheme_code ?? null,
      d.interest_rate ?? 0, d.ticker_symbol ?? null,
      d.exchange ?? 'NSE', d.purity ?? '24K'
    )
    return { id: result.lastInsertRowid }
  })

  ipcMain.handle('investments:update', (_, d) => {
    db.prepare(`
      UPDATE investments SET name = ?, type = ?, provider = ?, bank_or_amc = ?,
        account_number = ?, invested_amount = ?, current_value = ?, monthly_sip_amount = ?,
        sip_frequency = ?, start_date = ?, maturity_date = ?, goal_id = ?, notes = ?,
        units = ?, purchase_price = ?, scheme_code = ?, interest_rate = ?,
        ticker_symbol = ?, exchange = ?, purity = ?,
        last_updated_at = datetime('now')
      WHERE id = ?
    `).run(
      d.name, d.type, d.provider ?? null, d.bank_or_amc ?? null,
      d.account_number ?? null, d.invested_amount, d.current_value,
      d.monthly_sip_amount ?? 0, d.sip_frequency ?? 'monthly',
      d.start_date ?? null, d.maturity_date ?? null,
      d.goal_id ?? null, d.notes ?? null,
      d.units ?? 0, d.purchase_price ?? 0, d.scheme_code ?? null,
      d.interest_rate ?? 0, d.ticker_symbol ?? null,
      d.exchange ?? 'NSE', d.purity ?? '24K', d.id
    )
    return { success: true }
  })

  ipcMain.handle('investments:delete', (_, id) => {
    db.prepare('DELETE FROM investments WHERE id = ?').run(id)
    return { success: true }
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
    const tx = db.transaction(() => {
      // Close current active plan
      const active = db.prepare('SELECT id FROM salary_plans WHERE is_active = 1 LIMIT 1').get()
      if (active) {
        const prevDay = new Date(new Date(effective_from).getTime() - 86_400_000)
          .toISOString().slice(0, 10)
        db.prepare('UPDATE salary_plans SET is_active = 0, effective_to = ? WHERE id = ?')
          .run(prevDay, active.id)
      }
      // Insert new plan
      const { lastInsertRowid: planId } = db.prepare(
        `INSERT INTO salary_plans (label, monthly_salary, effective_from, is_active, notes)
         VALUES (?, ?, ?, 1, ?)`
      ).run(label, monthly_salary, effective_from, notes ?? null)
      // Insert items
      const ins = db.prepare(
        `INSERT INTO salary_plan_items (plan_id, name, amount, category, bank_or_provider, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      ;(items || []).forEach((it, i) => {
        ins.run(planId, it.name, it.amount, it.category, it.bank_or_provider ?? null, i)
      })
      // Update profile salary
      const prof = db.prepare('SELECT id FROM profile LIMIT 1').get()
      if (prof) {
        db.prepare(`UPDATE profile SET monthly_salary = ?, salary_updated_at = datetime('now') WHERE id = ?`)
          .run(monthly_salary, prof.id)
      } else {
        db.prepare(`INSERT INTO profile (name, monthly_salary, salary_updated_at) VALUES ('', ?, datetime('now'))`)
          .run(monthly_salary)
      }
      return planId
    })
    return { id: tx() }
  })

  ipcMain.handle('plans:updateItems', (_, { planId, items, monthly_salary, label }) => {
    db.transaction(() => {
      if (label != null)          db.prepare('UPDATE salary_plans SET label = ? WHERE id = ?').run(label, planId)
      if (monthly_salary != null) {
        db.prepare('UPDATE salary_plans SET monthly_salary = ? WHERE id = ?').run(monthly_salary, planId)
        const prof = db.prepare('SELECT id FROM profile LIMIT 1').get()
        if (prof) {
          db.prepare(`UPDATE profile SET monthly_salary = ?, salary_updated_at = datetime('now') WHERE id = ?`)
            .run(monthly_salary, prof.id)
        }
      }
      db.prepare('DELETE FROM salary_plan_items WHERE plan_id = ?').run(planId)
      const ins = db.prepare(
        `INSERT INTO salary_plan_items (plan_id, name, amount, category, bank_or_provider, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      ;(items || []).forEach((it, i) => {
        ins.run(planId, it.name, it.amount, it.category, it.bank_or_provider ?? null, i)
      })
    })()
    return { success: true }
  })

  // ── Expenses ──────────────────────────────────────────────────────────────
  ipcMain.handle('expenses:getAll', (_, filter = {}) => {
    let query = 'SELECT e.*, u.name as logged_by_name FROM expenses e LEFT JOIN users u ON e.logged_by_user_id = u.id WHERE 1=1'
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
    const syncId  = generateExpenseSyncId()
    const result  = db.prepare(
      'INSERT INTO expenses (sync_id, amount, category, note, date, logged_by_user_id) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(syncId, d.amount, d.category, d.note ?? null, d.date, currentUserSession?.id ?? null)
    // Auto-push to Drive in background (fire and forget)
    const { connected } = getDriveStatus()
    if (connected) {
      const deviceId = getOrCreateDeviceId()
      getAllExpensesForSync(db)
      pushExpensesSync(getAllExpensesForSync(db), deviceId).catch(() => {})
    }
    return { id: result.lastInsertRowid }
  })

  ipcMain.handle('expenses:update', (_, d) => {
    db.prepare(`
      UPDATE expenses SET amount = ?, category = ?, note = ?, date = ? WHERE id = ?
    `).run(d.amount, d.category, d.note ?? null, d.date, d.id)
    return { success: true }
  })

  ipcMain.handle('expenses:delete', (_, id) => {
    db.prepare('DELETE FROM expenses WHERE id = ?').run(id)
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
  ipcMain.handle('dashboard:getStats', () => {
    const { totalInvested } = db.prepare(
      'SELECT COALESCE(SUM(invested_amount), 0) as totalInvested FROM investments'
    ).get()
    const { netWorth } = db.prepare(
      'SELECT COALESCE(SUM(current_value), 0) as netWorth FROM investments'
    ).get()
    const now = new Date()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const year = String(now.getFullYear())
    const { thisMonthSpend } = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as thisMonthSpend FROM expenses
      WHERE strftime('%m', date) = ? AND strftime('%Y', date) = ?
    `).get(month, year)
    const { goalsActive } = db.prepare(
      "SELECT COUNT(*) as goalsActive FROM goals WHERE is_achieved = 0"
    ).get()

    return { netWorth, totalInvested, thisMonthSpend, goalsActive }
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
}
