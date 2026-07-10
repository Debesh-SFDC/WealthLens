import { Preferences } from '@capacitor/preferences'
import { Browser } from '@capacitor/browser'
import { App } from '@capacitor/app'
import { getOrCreateDeviceId, getAllExpensesForSync, mergeExpensesFromSync } from '../db/index.js'

const SYNC_PREFIX = 'wealthlens_sync_'
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email'

// Web application OAuth client credentials — supplied at runtime via saveCredentials(),
// never hardcoded here (this file ships in a public repo).
const BAKED_CLIENT_ID     = ''
const BAKED_CLIENT_SECRET = ''
const REDIRECT_URI = 'https://debesh-sfdc.github.io/WealthLens/'

// ── Token storage ─────────────────────────────────────────────────────────────

async function getTokens() {
  const { value } = await Preferences.get({ key: 'drive_tokens' })
  return value ? JSON.parse(value) : null
}

async function saveTokens(tokens) {
  const existing = await getTokens() || {}
  await Preferences.set({ key: 'drive_tokens', value: JSON.stringify({ ...existing, ...tokens }) })
}

export async function clearTokens() {
  await Preferences.remove({ key: 'drive_tokens' })
}

// ── Credentials (user-supplied Client ID/Secret) ──────────────────────────────

export async function getCredentials() {
  // Always prefer baked-in so updates take effect automatically
  if (BAKED_CLIENT_ID && BAKED_CLIENT_SECRET) {
    return { clientId: BAKED_CLIENT_ID, clientSecret: BAKED_CLIENT_SECRET }
  }
  // Fall back to user-stored credentials
  const { value } = await Preferences.get({ key: 'drive_creds' })
  if (value) {
    const stored = JSON.parse(value)
    if (stored?.clientId && stored?.clientSecret) return stored
  }
  return null
}

export async function saveCredentials(clientId, clientSecret) {
  await Preferences.set({ key: 'drive_creds', value: JSON.stringify({ clientId, clientSecret }) })
}

export async function hasCreds() {
  const creds = await getCredentials()
  return Boolean(creds?.clientId && creds?.clientSecret)
}

// ── Status ────────────────────────────────────────────────────────────────────

export async function getDriveStatus() {
  const tokens = await getTokens()
  return {
    connected: Boolean(tokens?.access_token),
    email: tokens?.email || null,
    lastSync: tokens?.lastSync || null,
  }
}

// ── OAuth2 flow ───────────────────────────────────────────────────────────────

export async function connectDrive(clientId, clientSecret) {
  await saveCredentials(clientId, clientSecret)

  const state = Math.random().toString(36).slice(2)
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', SCOPES)
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent')
  authUrl.searchParams.set('state', state)

  return new Promise((resolve, reject) => {
    let handled = false

    const listener = App.addListener('appUrlOpen', async ({ url }) => {
      if (handled) return
      if (!url.startsWith('com.wealthlens.tracker://oauth')) return
      handled = true
      listener.remove()
      await Browser.close()

      try {
        const params = new URL(url).searchParams
        if (params.get('state') !== state) throw new Error('State mismatch')
        const code = params.get('code')
        if (!code) throw new Error('No auth code')

        const tokens = await exchangeCode(clientId, clientSecret, code)
        const email  = await getUserEmail(tokens.access_token)
        await saveTokens({ ...tokens, email })
        resolve({ email })
      } catch (e) {
        reject(e)
      }
    })

    Browser.open({ url: authUrl.toString(), presentationStyle: 'popover' })
      .catch(reject)
  })
}

async function exchangeCode(clientId, clientSecret, code) {
  const params = { code, client_id: clientId, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' }
  if (clientSecret) params.client_secret = clientSecret
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`)
  return res.json()
}

async function getUserEmail(accessToken) {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.email
}

// ── Token refresh ─────────────────────────────────────────────────────────────

async function refreshAccessToken() {
  const tokens = await getTokens()
  const creds  = await getCredentials()
  if (!tokens?.refresh_token || !creds) throw new Error('Cannot refresh token')

  const refreshParams = { refresh_token: tokens.refresh_token, client_id: creds.clientId, grant_type: 'refresh_token' }
  if (creds.clientSecret) refreshParams.client_secret = creds.clientSecret
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(refreshParams),
  })
  if (!res.ok) throw new Error('Token refresh failed')
  const newTokens = await res.json()
  await saveTokens(newTokens)
  return newTokens.access_token
}

async function getAccessToken() {
  const tokens = await getTokens()
  if (!tokens?.access_token) throw new Error('Not connected to Google Drive')

  // Check expiry (subtract 60s buffer)
  if (tokens.expiry_date && Date.now() < tokens.expiry_date - 60_000) {
    return tokens.access_token
  }
  return refreshAccessToken()
}

// ── Drive folder ──────────────────────────────────────────────────────────────

async function ensureFolder(accessToken) {
  const res = await driveRequest(accessToken, '/drive/v3/files', 'GET', null, {
    q: "name='WealthLens' and mimeType='application/vnd.google-apps.folder' and trashed=false",
    fields: 'files(id)',
  })
  if (res.files?.length) return res.files[0].id

  const created = await driveRequest(accessToken, '/drive/v3/files', 'POST', {
    name: 'WealthLens',
    mimeType: 'application/vnd.google-apps.folder',
  })
  return created.id
}

// ── Drive REST helper ─────────────────────────────────────────────────────────

async function driveRequest(token, path, method = 'GET', body = null, queryParams = {}) {
  const url = new URL(`https://www.googleapis.com${path}`)
  Object.entries(queryParams).forEach(([k, v]) => url.searchParams.set(k, v))

  const opts = {
    method,
    headers: { Authorization: `Bearer ${token}` },
  }
  if (body) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(url.toString(), opts)
  if (!res.ok) throw new Error(`Drive API error ${res.status}: ${await res.text()}`)
  return res.json()
}

async function driveUpload(token, metadata, content, existingFileId = null) {
  const method = existingFileId ? 'PATCH' : 'POST'
  const path = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart'

  const boundary = '-------314159265358979323846'
  const metaPart = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n`
  const dataPart = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`
  const body = metaPart + dataPart

  const res = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary="${boundary}"`,
    },
    body,
  })
  if (!res.ok) throw new Error(`Upload error ${res.status}: ${await res.text()}`)
  return res.json()
}

// ── Push / Pull ───────────────────────────────────────────────────────────────

export async function syncPush() {
  const token    = await getAccessToken()
  const deviceId = await getOrCreateDeviceId()
  const folderId = await ensureFolder(token)
  const expenses = await getAllExpensesForSync()
  const fileName = `${SYNC_PREFIX}${deviceId}.json`
  const content  = JSON.stringify({ device_id: deviceId, updated_at: new Date().toISOString(), expenses })

  // Find existing file
  const res = await driveRequest(token, '/drive/v3/files', 'GET', null, {
    q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
    fields: 'files(id)',
  })

  if (res.files?.length) {
    await driveUpload(token, {}, content, res.files[0].id)
  } else {
    await driveUpload(token, { name: fileName, parents: [folderId] }, content)
  }

  await saveTokens({ lastSync: new Date().toISOString() })
}

export async function syncPull() {
  const token    = await getAccessToken()
  const deviceId = await getOrCreateDeviceId()
  const folderId = await ensureFolder(token)

  const res = await driveRequest(token, '/drive/v3/files', 'GET', null, {
    q: `name contains '${SYNC_PREFIX}' and '${folderId}' in parents and trashed=false`,
    fields: 'files(id,name)',
  })

  const others = (res.files || []).filter(f => !f.name.includes(deviceId))
  const allExpenses = []

  for (const file of others) {
    try {
      const url = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      const data = await r.json()
      if (Array.isArray(data.expenses)) allExpenses.push(...data.expenses)
    } catch {}
  }

  const merged = await mergeExpensesFromSync(allExpenses)
  return { merged, total: allExpenses.length }
}

export async function fullSync() {
  await syncPush()
  const result = await syncPull()
  return result
}
