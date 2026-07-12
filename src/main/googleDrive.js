import http from 'http'
import { execFile } from 'child_process'
import { createReadStream, createWriteStream, readFileSync, writeFileSync, existsSync, renameSync, unlinkSync, statSync } from 'fs'
import { join } from 'path'
import { shell, app, safeStorage } from 'electron'
import { google } from 'googleapis'
import { randomUUID } from 'crypto'

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
]

const TOKEN_PATH    = join(app.getPath('userData'), 'drive_token.enc')
const CREDS_PATH    = join(app.getPath('userData'), 'drive_creds.json')
const SETTINGS_PATH = join(app.getPath('userData'), 'app_settings.json')

// Tracks whether the last backup attempt failed
let _syncFailed = false

// ── Secure token storage (Electron safeStorage) ───────────────────────────
function saveTokensSecure(tokens) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure storage is not available on this system. Google Drive sync requires OS-level encryption (macOS Keychain / Windows DPAPI).')
  }
  const encrypted = safeStorage.encryptString(JSON.stringify(tokens))
  writeFileSync(TOKEN_PATH, encrypted)
}

function loadTokensSecure() {
  if (!existsSync(TOKEN_PATH)) return null
  try {
    if (!safeStorage.isEncryptionAvailable()) return null
    const buf = readFileSync(TOKEN_PATH)
    return JSON.parse(safeStorage.decryptString(buf))
  } catch {
    return null
  }
}

// Row-level sync shares the same "last contact with Drive" bookkeeping the
// full-DB backup feature already uses, so the existing TopBar 🟢/🟡/🔴
// indicator and getSyncStatus() reflect row-level syncs too, without a
// separate parallel status system.
export function markSyncSuccess() {
  const tokens = loadTokensSecure()
  if (!tokens) return
  saveTokensSecure({ ...tokens, lastBackup: new Date().toISOString() })
  _syncFailed = false
}

export function markSyncFailed() {
  _syncFailed = true
}

// ── Client credentials (Client ID / Secret — user-supplied, not sensitive) ──
export function getStoredCreds() {
  if (!existsSync(CREDS_PATH)) return null
  try { return JSON.parse(readFileSync(CREDS_PATH, 'utf-8')) } catch { return null }
}

export function saveCreds(clientId, clientSecret) {
  writeFileSync(CREDS_PATH, JSON.stringify({ clientId, clientSecret }))
}

// ── App settings ──────────────────────────────────────────────────────────
export function getAppSettings() {
  if (!existsSync(SETTINGS_PATH)) return { autoBackup: false }
  try { return JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8')) } catch { return { autoBackup: false } }
}

export function saveAppSettings(s) {
  writeFileSync(SETTINGS_PATH, JSON.stringify(s))
}

// ── OAuth2 helpers ────────────────────────────────────────────────────────
function makeOAuth2Client(clientId, clientSecret, redirectUri = 'http://127.0.0.1') {
  const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri)
  // Persist token refreshes automatically
  client.on('tokens', (newTokens) => {
    const existing = loadTokensSecure() || {}
    saveTokensSecure({ ...existing, ...newTokens })
  })
  return client
}

function getAuthorizedClient() {
  const creds = getStoredCreds()
  if (!creds) throw new Error('No credentials saved')
  const tokens = loadTokensSecure()
  if (!tokens?.access_token) throw new Error('Not connected to Google Drive')
  const client = makeOAuth2Client(creds.clientId, creds.clientSecret)
  client.setCredentials(tokens)
  return client
}

// ── OAuth2 initiation ─────────────────────────────────────────────────────
export function initiateAuth(clientId, clientSecret, browserApp = null) {
  return new Promise((resolve, reject) => {
    const server = http.createServer()
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      const redirectUri = `http://127.0.0.1:${port}/callback`
      const oauth2Client = makeOAuth2Client(clientId, clientSecret, redirectUri)

      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: SCOPES,
      })

      // Open in the user-chosen browser (macOS: `open -a "AppName" url`), or system default
      if (browserApp && process.platform === 'darwin') {
        execFile('open', ['-a', browserApp, authUrl], (err) => {
          if (err) shell.openExternal(authUrl) // fallback if app not found
        })
      } else {
        shell.openExternal(authUrl)
      }

      server.once('request', async (req, res) => {
        try {
          const url = new URL(req.url, `http://127.0.0.1:${port}`)
          const code = url.searchParams.get('code')
          if (!code) throw new Error('No auth code received in redirect')

          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end(`<html><body style="font-family:sans-serif;padding:40px;text-align:center">
            <h2 style="color:#6C63FF">✅ WealthLens connected to Google Drive!</h2>
            <p style="color:#555">You can close this tab and return to the app.</p>
          </body></html>`)
          server.close()

          const { tokens } = await oauth2Client.getToken(code)
          oauth2Client.setCredentials(tokens)

          // Get user email via googleapis oauth2 service
          const oauth2Service = google.oauth2({ version: 'v2', auth: oauth2Client })
          const { data: userInfo } = await oauth2Service.userinfo.get()

          saveTokensSecure({ ...tokens, email: userInfo.email })
          _syncFailed = false
          resolve({ email: userInfo.email })
        } catch (e) {
          server.close()
          reject(e)
        }
      })
    })
  })
}

export function disconnect() {
  if (existsSync(TOKEN_PATH)) unlinkSync(TOKEN_PATH)
  _syncFailed = false
}

// ── Drive folder helper ───────────────────────────────────────────────────
async function ensureFolder(drive) {
  const res = await drive.files.list({
    q: "name='WealthLens' and mimeType='application/vnd.google-apps.folder' and trashed=false",
    fields: 'files(id)',
    spaces: 'drive',
  })
  if (res.data.files?.length) return res.data.files[0].id

  const createRes = await drive.files.create({
    requestBody: { name: 'WealthLens', mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id',
  })
  return createRes.data.id
}

// ── Backup ────────────────────────────────────────────────────────────────
export async function backupDatabase(dbPath) {
  try {
    const auth  = getAuthorizedClient()
    const drive = google.drive({ version: 'v3', auth })
    const folderId = await ensureFolder(drive)

    const dateStr  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const fileName = `WealthLens_backup_${dateStr}.db`

    const res = await drive.files.create({
      requestBody: { name: fileName, parents: [folderId] },
      media: { mimeType: 'application/octet-stream', body: createReadStream(dbPath) },
      fields: 'id,name,createdTime',
    })

    const tokens = loadTokensSecure()
    saveTokensSecure({ ...tokens, lastBackup: new Date().toISOString() })
    _syncFailed = false
    return { id: res.data.id, name: res.data.name }
  } catch (e) {
    _syncFailed = true
    throw e
  }
}

// ── List backups ──────────────────────────────────────────────────────────
export async function listBackups() {
  const auth  = getAuthorizedClient()
  const drive = google.drive({ version: 'v3', auth })

  const res = await drive.files.list({
    q: "name contains 'WealthLens_backup' and trashed=false",
    fields: 'files(id,name,createdTime,size)',
    orderBy: 'createdTime desc',
    spaces: 'drive',
  })
  return res.data.files || []
}

// ── Restore ───────────────────────────────────────────────────────────────
export async function restoreFromDrive(fileId, dbPath) {
  const auth  = getAuthorizedClient()
  const drive = google.drive({ version: 'v3', auth })

  const tmpPath = dbPath + '.restore_tmp'
  const destStream = createWriteStream(tmpPath)

  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' }
  )

  await new Promise((resolve, reject) => {
    res.data.pipe(destStream)
    destStream.on('finish', resolve)
    destStream.on('error', reject)
    res.data.on('error', reject)
  })

  renameSync(tmpPath, dbPath)
  return { success: true }
}

// ── Status ────────────────────────────────────────────────────────────────
export function getDriveStatus() {
  const tokens = loadTokensSecure()
  const connected = Boolean(tokens?.access_token && tokens?.email)
  return {
    connected,
    email: tokens?.email || null,
    lastBackup: tokens?.lastBackup || null,
  }
}

export function getSyncStatus(dbPath) {
  const tokens = loadTokensSecure()
  if (!tokens?.access_token) return { status: 'disconnected' }

  if (_syncFailed) {
    return { status: 'failed', lastBackup: tokens.lastBackup || null }
  }

  const lastBackup   = tokens.lastBackup ? new Date(tokens.lastBackup) : null
  let   lastDbChange = null
  try { lastDbChange = statSync(dbPath).mtime } catch {}

  if (!lastBackup) {
    return { status: 'unsynced', lastDbChange: lastDbChange?.toISOString() || null }
  }

  if (lastDbChange && lastDbChange > lastBackup) {
    return {
      status: 'unsynced',
      lastBackup: tokens.lastBackup,
      lastDbChange: lastDbChange.toISOString(),
    }
  }

  return { status: 'synced', lastBackup: tokens.lastBackup }
}

export function getDbLastModified(dbPath) {
  try { return statSync(dbPath).mtime.toISOString() } catch { return null }
}

// ── Device ID (persisted in app_settings.json) ────────────────────────────
// Format: "mac-<uuid>" / "win-<uuid>" — lets sync payloads and the Sync Log
// show which physical device last touched a row without a lookup table.
export function getOrCreateDeviceId() {
  const settings = getAppSettings()
  if (settings.deviceId) return settings.deviceId
  const prefix = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : process.platform
  const id = `${prefix}-${randomUUID()}`
  saveAppSettings({ ...settings, deviceId: id })
  return id
}

// ── Unified row-level sync file (single shared WealthLens_sync.json) ──────
const SYNC_FILE_NAME = 'WealthLens_sync.json'

async function findSyncFile(drive, folderId) {
  const res = await drive.files.list({
    q: `name='${SYNC_FILE_NAME}' and '${folderId}' in parents and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  })
  return res.data.files?.[0]?.id || null
}

// Returns null if no sync file exists yet on Drive (first-ever sync for this account).
export async function pullSyncFile() {
  const auth     = getAuthorizedClient()
  const drive    = google.drive({ version: 'v3', auth })
  const folderId = await ensureFolder(drive)
  const fileId   = await findSyncFile(drive, folderId)
  if (!fileId) return null

  const resp = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'text' })
  const text = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data)
  return JSON.parse(text)
}

export async function pushSyncFile(syncObject) {
  const auth     = getAuthorizedClient()
  const drive    = google.drive({ version: 'v3', auth })
  const folderId = await ensureFolder(drive)
  const fileId   = await findSyncFile(drive, folderId)
  const body     = JSON.stringify(syncObject)

  if (fileId) {
    await drive.files.update({ fileId, media: { mimeType: 'application/json', body } })
  } else {
    await drive.files.create({
      requestBody: { name: SYNC_FILE_NAME, parents: [folderId] },
      media:       { mimeType: 'application/json', body },
      fields:      'id',
    })
  }
}

// ── Incremental expense sync ──────────────────────────────────────────────
const SYNC_PREFIX = 'wealthlens_sync_'

export async function pushExpensesSync(expenses, deviceId) {
  const auth     = getAuthorizedClient()
  const drive    = google.drive({ version: 'v3', auth })
  const folderId = await ensureFolder(drive)
  const fileName = `${SYNC_PREFIX}${deviceId}.json`
  const body     = JSON.stringify({ device_id: deviceId, updated_at: new Date().toISOString(), expenses })

  const existing = await drive.files.list({
    q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  })

  if (existing.data.files?.length) {
    await drive.files.update({
      fileId: existing.data.files[0].id,
      media:  { mimeType: 'application/json', body },
    })
  } else {
    await drive.files.create({
      requestBody: { name: fileName, parents: [folderId] },
      media:       { mimeType: 'application/json', body },
      fields:      'id',
    })
  }
}

export async function pullExpensesSync(deviceId) {
  const auth     = getAuthorizedClient()
  const drive    = google.drive({ version: 'v3', auth })
  const folderId = await ensureFolder(drive)

  const res = await drive.files.list({
    q:      `name contains '${SYNC_PREFIX}' and '${folderId}' in parents and trashed=false`,
    fields: 'files(id,name)',
    spaces: 'drive',
  })

  const otherFiles = (res.data.files || []).filter(f => !f.name.includes(deviceId))
  const allExpenses = []

  for (const file of otherFiles) {
    try {
      const resp = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'text' })
      const data = JSON.parse(typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data))
      if (Array.isArray(data.expenses)) allExpenses.push(...data.expenses)
    } catch {}
  }

  return allExpenses
}
