import http from 'http'
import { shell, app } from 'electron'
import { readFileSync, writeFileSync, existsSync, createWriteStream, renameSync } from 'fs'
import { join } from 'path'

const GOOGLE_AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const DRIVE_FILES_URL  = 'https://www.googleapis.com/drive/v3/files'
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files'
const SCOPES           = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email'

const TOKEN_PATH    = join(app.getPath('userData'), 'drive_token.json')
const CREDS_PATH    = join(app.getPath('userData'), 'drive_creds.json')
const SETTINGS_PATH = join(app.getPath('userData'), 'app_settings.json')

// ── Persistence helpers ───────────────────────────────────────────────────
export function getStoredTokens() {
  if (!existsSync(TOKEN_PATH)) return null
  try { return JSON.parse(readFileSync(TOKEN_PATH, 'utf-8')) } catch { return null }
}

function saveTokens(t) { writeFileSync(TOKEN_PATH, JSON.stringify(t)) }

export function getStoredCreds() {
  if (!existsSync(CREDS_PATH)) return null
  try { return JSON.parse(readFileSync(CREDS_PATH, 'utf-8')) } catch { return null }
}

export function saveCreds(clientId, clientSecret) {
  writeFileSync(CREDS_PATH, JSON.stringify({ clientId, clientSecret }))
}

export function getAppSettings() {
  if (!existsSync(SETTINGS_PATH)) return { autoBackup: false }
  try { return JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8')) } catch { return { autoBackup: false } }
}

export function saveAppSettings(s) { writeFileSync(SETTINGS_PATH, JSON.stringify(s)) }

// ── OAuth2 helpers ────────────────────────────────────────────────────────
async function refreshToken(clientId, clientSecret, refreshTok) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: refreshTok, grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`)
  return res.json()
}

async function getValidToken(clientId, clientSecret) {
  const tokens = getStoredTokens()
  if (!tokens?.access_token) throw new Error('Not connected to Google Drive')
  const expired = tokens.expiry_date && Date.now() >= tokens.expiry_date - 60_000
  if (expired && tokens.refresh_token) {
    const fresh = await refreshToken(clientId, clientSecret, tokens.refresh_token)
    const updated = { ...tokens, ...fresh, expiry_date: Date.now() + fresh.expires_in * 1000 }
    saveTokens(updated)
    return updated.access_token
  }
  return tokens.access_token
}

// ── OAuth2 initiation (opens browser, waits for redirect) ─────────────────
export function initiateAuth(clientId, clientSecret) {
  return new Promise((resolve, reject) => {
    const server = http.createServer()
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      const redirectUri = `http://127.0.0.1:${port}/callback`

      const authUrl = new URL(GOOGLE_AUTH_URL)
      authUrl.searchParams.set('client_id', clientId)
      authUrl.searchParams.set('redirect_uri', redirectUri)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('scope', SCOPES)
      authUrl.searchParams.set('access_type', 'offline')
      authUrl.searchParams.set('prompt', 'consent')

      shell.openExternal(authUrl.toString())

      server.once('request', async (req, res) => {
        try {
          const url = new URL(req.url, `http://127.0.0.1:${port}`)
          const code = url.searchParams.get('code')
          if (!code) throw new Error('No auth code in redirect')

          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end('<html><body style="font-family:sans-serif;padding:40px"><h2>✅ WealthLens connected to Google Drive!</h2><p>You can close this tab and return to the app.</p></body></html>')
          server.close()

          // Exchange code → tokens
          const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              code, client_id: clientId, client_secret: clientSecret,
              redirect_uri: redirectUri, grant_type: 'authorization_code',
            }),
          })
          if (!tokenRes.ok) throw new Error(`Token exchange failed: ${tokenRes.status}`)
          const tokens = await tokenRes.json()

          // Fetch user email
          const infoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          })
          const info = await infoRes.json()

          saveTokens({ ...tokens, expiry_date: Date.now() + tokens.expires_in * 1000, email: info.email })
          resolve({ email: info.email })
        } catch (e) {
          server.close()
          reject(e)
        }
      })
    })
  })
}

export function disconnect() {
  if (existsSync(TOKEN_PATH)) writeFileSync(TOKEN_PATH, '{}')
}

// ── Drive folder helper ───────────────────────────────────────────────────
async function ensureFolder(accessToken) {
  const listRes = await fetch(
    `${DRIVE_FILES_URL}?q=${encodeURIComponent("name='WealthLens' and mimeType='application/vnd.google-apps.folder' and trashed=false")}&fields=files(id)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const { files } = await listRes.json()
  if (files?.length) return files[0].id

  const createRes = await fetch(DRIVE_FILES_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'WealthLens', mimeType: 'application/vnd.google-apps.folder' }),
  })
  const folder = await createRes.json()
  return folder.id
}

// ── Backup ────────────────────────────────────────────────────────────────
export async function backupDatabase(dbPath) {
  const creds = getStoredCreds()
  if (!creds) throw new Error('No credentials saved')
  const accessToken = await getValidToken(creds.clientId, creds.clientSecret)
  const folderId = await ensureFolder(accessToken)

  const fileBuffer = readFileSync(dbPath)
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const fileName = `WealthLens_backup_${dateStr}.db`
  const boundary = 'WealthLensBackupBoundary'

  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
    Buffer.from(JSON.stringify({ name: fileName, parents: [folderId] })),
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--`),
  ])

  const uploadRes = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,name,createdTime`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary="${boundary}"`,
    },
    body,
  })
  if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`)
  const file = await uploadRes.json()

  const tokens = getStoredTokens()
  saveTokens({ ...tokens, lastBackup: new Date().toISOString() })
  return { id: file.id, name: file.name }
}

// ── List backups ──────────────────────────────────────────────────────────
export async function listBackups() {
  const creds = getStoredCreds()
  if (!creds) throw new Error('No credentials saved')
  const accessToken = await getValidToken(creds.clientId, creds.clientSecret)

  const res = await fetch(
    `${DRIVE_FILES_URL}?q=${encodeURIComponent("name contains 'WealthLens_backup' and trashed=false")}&fields=files(id,name,createdTime,size)&orderBy=createdTime+desc`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) throw new Error(`List failed: ${res.status}`)
  const { files } = await res.json()
  return files || []
}

// ── Restore ───────────────────────────────────────────────────────────────
export async function restoreFromDrive(fileId, dbPath) {
  const creds = getStoredCreds()
  if (!creds) throw new Error('No credentials saved')
  const accessToken = await getValidToken(creds.clientId, creds.clientSecret)

  const res = await fetch(`${DRIVE_FILES_URL}/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)

  const buf = Buffer.from(await res.arrayBuffer())
  const tmpPath = dbPath + '.restore_tmp'
  writeFileSync(tmpPath, buf)
  renameSync(tmpPath, dbPath)
  return { success: true }
}

// ── Status ────────────────────────────────────────────────────────────────
export function getDriveStatus() {
  const tokens = getStoredTokens()
  const connected = Boolean(tokens?.access_token && tokens?.email)
  return {
    connected,
    email: tokens?.email || null,
    lastBackup: tokens?.lastBackup || null,
  }
}
