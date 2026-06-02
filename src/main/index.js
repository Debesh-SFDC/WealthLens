import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { initDatabase, getDb } from '../db/database.js'

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

app.whenReady().then(() => {
  initDatabase()
  setupIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
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
        goal_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      d.name, d.type, d.provider ?? null, d.bank_or_amc ?? null,
      d.account_number ?? null, d.invested_amount ?? 0, d.current_value ?? 0,
      d.monthly_sip_amount ?? 0, d.start_date ?? null, d.maturity_date ?? null,
      d.goal_id ?? null, d.notes ?? null
    )
    return { id: result.lastInsertRowid }
  })

  ipcMain.handle('investments:update', (_, d) => {
    db.prepare(`
      UPDATE investments SET name = ?, type = ?, provider = ?, bank_or_amc = ?,
        account_number = ?, invested_amount = ?, current_value = ?, monthly_sip_amount = ?,
        start_date = ?, maturity_date = ?, goal_id = ?, notes = ?,
        last_updated_at = datetime('now')
      WHERE id = ?
    `).run(
      d.name, d.type, d.provider ?? null, d.bank_or_amc ?? null,
      d.account_number ?? null, d.invested_amount, d.current_value,
      d.monthly_sip_amount, d.start_date ?? null, d.maturity_date ?? null,
      d.goal_id ?? null, d.notes ?? null, d.id
    )
    return { success: true }
  })

  ipcMain.handle('investments:delete', (_, id) => {
    db.prepare('DELETE FROM investments WHERE id = ?').run(id)
    return { success: true }
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
}
