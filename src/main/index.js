import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { initDatabase, getDb } from '../db/database.js'
import {
  initiateAuth, disconnect as driveDisconnect, backupDatabase, listBackups,
  restoreFromDrive, getDriveStatus, getSyncStatus, getDbLastModified,
  getStoredCreds, saveCreds, getAppSettings, saveAppSettings,
} from './googleDrive.js'

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    titleBarStyle: 'default',
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

const dbPath = join(app.getPath('userData'), 'wealthlens.db')

app.whenReady().then(() => {
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

function setupIpcHandlers() {
  const db = getDb()

  // ── Profile ──────────────────────────────────────────────────────────────
  ipcMain.handle('profile:get', () => {
    return db.prepare('SELECT * FROM profile LIMIT 1').get() ?? null
  })

  ipcMain.handle('profile:save', (_, data) => {
    const existing = db.prepare('SELECT id FROM profile LIMIT 1').get()
    if (existing) {
      db.prepare(
        `UPDATE profile SET name = ?, monthly_salary = ?, salary_updated_at = datetime('now') WHERE id = ?`
      ).run(data.name, data.monthly_salary, existing.id)
      return { id: existing.id }
    }
    const result = db.prepare(
      `INSERT INTO profile (name, monthly_salary, salary_updated_at) VALUES (?, ?, datetime('now'))`
    ).run(data.name, data.monthly_salary)
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
    if (goalId) {
      return db.prepare(
        'SELECT * FROM investments WHERE goal_id = ? ORDER BY last_updated_at DESC'
      ).all(goalId)
    }
    return db.prepare(`
      SELECT i.*, g.title as goal_title
      FROM investments i
      LEFT JOIN goals g ON i.goal_id = g.id
      ORDER BY i.last_updated_at DESC
    `).all()
  })

  ipcMain.handle('investments:create', (_, d) => {
    const result = db.prepare(`
      INSERT INTO investments (name, type, provider, bank_or_amc, account_number,
        invested_amount, current_value, monthly_sip_amount, start_date, maturity_date,
        goal_id, notes, units, purchase_price, scheme_code, interest_rate,
        ticker_symbol, exchange, purity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      d.name, d.type, d.provider ?? null, d.bank_or_amc ?? null,
      d.account_number ?? null, d.invested_amount ?? 0, d.current_value ?? 0,
      d.monthly_sip_amount ?? 0, d.start_date ?? null, d.maturity_date ?? null,
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
        start_date = ?, maturity_date = ?, goal_id = ?, notes = ?,
        units = ?, purchase_price = ?, scheme_code = ?, interest_rate = ?,
        ticker_symbol = ?, exchange = ?, purity = ?,
        last_updated_at = datetime('now')
      WHERE id = ?
    `).run(
      d.name, d.type, d.provider ?? null, d.bank_or_amc ?? null,
      d.account_number ?? null, d.invested_amount, d.current_value,
      d.monthly_sip_amount ?? 0, d.start_date ?? null, d.maturity_date ?? null,
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

  // ── Expenses ──────────────────────────────────────────────────────────────
  ipcMain.handle('expenses:getAll', (_, filter) => {
    if (filter?.month && filter?.year) {
      return db.prepare(`
        SELECT * FROM expenses
        WHERE strftime('%m', date) = ? AND strftime('%Y', date) = ?
        ORDER BY date DESC, created_at DESC
      `).all(
        String(filter.month).padStart(2, '0'),
        String(filter.year)
      )
    }
    return db.prepare('SELECT * FROM expenses ORDER BY date DESC, created_at DESC').all()
  })

  ipcMain.handle('expenses:create', (_, d) => {
    const result = db.prepare(`
      INSERT INTO expenses (amount, category, note, date) VALUES (?, ?, ?, ?)
    `).run(d.amount, d.category, d.note ?? null, d.date)
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
  ipcMain.handle('drive:saveCredentials', (_, id, secret) => { saveCreds(id, secret); return { success: true } })
  ipcMain.handle('drive:connect',         async ()        => {
    const creds = getStoredCreds()
    if (!creds) throw new Error('No credentials saved — call drive:saveCredentials first')
    return initiateAuth(creds.clientId, creds.clientSecret)
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
}
