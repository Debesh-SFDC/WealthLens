const path = require('path')

const MODE = process.env.APP_MODE || process.env.VITE_APP_MODE || (process.env.NODE_ENV === 'production' ? 'web' : 'electron')

require('dotenv').config({ path: path.join(__dirname, '..', '..', `.env.${MODE}`) })

const express = require('express')
const cors = require('cors')
const { router: authRouter, requireAuth, requireAdmin } = require('./auth')
const goalsRouter = require('./routes/goals')
const investmentsRouter = require('./routes/investments')
const expensesRouter = require('./routes/expenses')
const salaryRouter = require('./routes/salary')
const syncRouter = require('./routes/sync')
const profileRouter = require('./routes/profile')
const trackerRouter = require('./routes/tracker')

const app = express()
const PORT = process.env.PORT || 3001
const IS_WEB = MODE === 'web'

const allowedOrigins = IS_WEB
  ? [process.env.CORS_ORIGIN || 'https://wealthlens.dsconsulting.in']
  : ['http://localhost:5173', 'http://127.0.0.1:5173']

app.use(cors({ origin: allowedOrigins, credentials: true }))
app.use(express.json())

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', mode: MODE })
})

app.use('/api/auth', authRouter)

// Goals — admin only (tracker has no business here)
app.use('/api/goals', requireAuth, requireAdmin, goalsRouter)

// Investments — admin only
app.use('/api/investments', requireAuth, requireAdmin, investmentsRouter)

// Expenses — keep as-is (already has tracker scoping inside)
app.use('/api/expenses', requireAuth, expensesRouter)

// Salary plans — admin only
app.use('/api/salary-plans', requireAuth, requireAdmin, salaryRouter)

// Sync — admin only (tracker syncs via Google Drive, not this endpoint)
app.use('/api/sync', requireAuth, requireAdmin, syncRouter)

// Profile — admin only
app.use('/api/profile', requireAuth, requireAdmin, profileRouter)

// Tracker summary — tracker-accessible, read-only aggregate view
app.use('/api/tracker', requireAuth, trackerRouter)

if (IS_WEB) {
  const distPath = path.join(__dirname, '..', '..', 'dist-web')
  app.use(express.static(distPath))
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`WealthLens server listening on port ${PORT} [mode=${MODE}]`)
})

module.exports = app
