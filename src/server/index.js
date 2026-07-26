const path = require('path')

const MODE = process.env.APP_MODE || process.env.VITE_APP_MODE || (process.env.NODE_ENV === 'production' ? 'web' : 'electron')

require('dotenv').config({ path: path.join(__dirname, '..', '..', `.env.${MODE}`) })

const express = require('express')
const cors = require('cors')
const { router: authRouter, requireAuth } = require('./auth')
const goalsRouter = require('./routes/goals')
const investmentsRouter = require('./routes/investments')
const expensesRouter = require('./routes/expenses')
const salaryRouter = require('./routes/salary')
const syncRouter = require('./routes/sync')
const profileRouter = require('./routes/profile')

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
app.use('/api/goals', requireAuth, goalsRouter)
app.use('/api/investments', requireAuth, investmentsRouter)
app.use('/api/expenses', requireAuth, expensesRouter)
app.use('/api/salary-plans', requireAuth, salaryRouter)
app.use('/api/sync', requireAuth, syncRouter)
app.use('/api/profile', requireAuth, profileRouter)

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
