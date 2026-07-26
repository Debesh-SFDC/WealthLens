// Universal API client — abstraction layer for the future Electron/web split.
// Not wired into any component yet; existing components keep calling
// window.electronAPI.* directly. This becomes the single call site once
// components are migrated off named IPC methods.
//
// NOTE: the Electron branch below assumes a generic `window.electron.ipcRenderer.invoke`
// bridge. The current preload (src/main/preload.js) only exposes named methods on
// window.electronAPI, not a raw per-channel invoke — that bridge will need a generic
// passthrough added before this file can actually replace existing IPC calls.

const IS_ELECTRON = import.meta.env.VITE_APP_MODE === 'electron'
const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

export async function apiCall(method, path, body) {
  if (IS_ELECTRON) {
    // Use existing IPC bridge (current behavior, unchanged)
    return window.electron.ipcRenderer.invoke(path, body)
  } else {
    // Use HTTP fetch for web mode (Hostinger)
    const res = await fetch(`${API_BASE}/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },
      body: body ? JSON.stringify(body) : undefined
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  }
}

function getToken() {
  return localStorage.getItem('wealthlens_token') || ''
}
