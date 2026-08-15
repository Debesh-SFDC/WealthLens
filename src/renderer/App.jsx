import { useState, useEffect, useCallback } from 'react'
import bridge from './lib/bridge'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import Onboarding from './components/Onboarding'
import AccountSetup from './components/AccountSetup'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Investments from './pages/Investments'
import Expenses from './pages/Expenses'
import SalaryAllocator from './pages/SalaryAllocator'
import NetWorth from './pages/NetWorth'
import FirePlannerPage from './pages/FirePlannerPage'
import Goals from './pages/Goals'
import Settings from './pages/Settings'
import TrackerApp from './components/TrackerApp'
import AdminWeight from './pages/AdminWeight'

const adminPages = {
  dashboard:   Dashboard,
  investments: Investments,
  expenses:    Expenses,
  networth:    NetWorth,
  fire:        FirePlannerPage,
  goals:       Goals,
  salary:      SalaryAllocator,
  settings:    Settings,
  health:      AdminWeight,
}

const IS_ELECTRON = typeof window !== 'undefined' && window.electronAPI !== undefined
const TOKEN_KEY = 'wealthlens_token'

function decodeWebSession() {
  const token = localStorage.getItem(TOKEN_KEY)
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      localStorage.removeItem(TOKEN_KEY)
      return null
    }
    return { id: payload.id, name: payload.name, role: payload.role }
  } catch {
    localStorage.removeItem(TOKEN_KEY)
    return null
  }
}

export default function App() {
  const [currentUser, setCurrentUser]       = useState(null)  // null = not logged in
  const [authChecked, setAuthChecked]       = useState(false) // waiting for session check
  const [hasUsers, setHasUsers]             = useState(null)  // null = still checking, false = first launch
  const [activePage, setActivePage]         = useState('dashboard')
  const [profileName, setProfileName]       = useState(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [appReady, setAppReady]             = useState(false)
  const [syncStatus, setSyncStatus]         = useState(null)

  // ── First-launch + session bootstrap ────────────────────────────────────
  useEffect(() => {
    async function checkSession() {
      try {
        const any = await bridge.hasAnyUser()
        setHasUsers(any)
        if (!any) { setAuthChecked(true); return }

        if (IS_ELECTRON) {
          const session = await window.electronAPI.getSession()
          if (session) setCurrentUser(session)
        } else {
          const session = decodeWebSession()
          if (session) setCurrentUser(session)
        }
      } catch {}
      setAuthChecked(true)
    }
    checkSession()
  }, [])

  // ── Load profile / onboarding (Admin only) ───────────────────────────────
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'admin') return
    bridge.getProfile()
      .then(profile => {
        if (!profile || !profile.name) setShowOnboarding(true)
        else setProfileName(profile.name)
        setAppReady(true)
      })
      .catch(() => { setShowOnboarding(true); setAppReady(true) })
  }, [currentUser])

  // ── Sync status polling (Admin only) ─────────────────────────────────────
  const loadSyncStatus = useCallback(async () => {
    try {
      const s = await window.electronAPI.getDriveSyncStatus()
      setSyncStatus(s)
    } catch {}
  }, [])

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'admin') return
    loadSyncStatus()
    const id = setInterval(loadSyncStatus, 30_000)
    return () => clearInterval(id)
  }, [currentUser, loadSyncStatus])

  // ── Tracker activity refresh ──────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'tracker') return
    const id = setInterval(() => {
      window.electronAPI.refreshActivity().catch(() => {})
    }, 60_000)
    return () => clearInterval(id)
  }, [currentUser])

  function handleSignIn(user) {
    setHasUsers(true)
    setCurrentUser(user)
    setAppReady(false)
  }

  async function handleSignOut() {
    if (IS_ELECTRON) {
      await window.electronAPI.logout()
    } else {
      localStorage.removeItem(TOKEN_KEY)
    }
    setCurrentUser(null)
    setAppReady(false)
    setShowOnboarding(false)
    setProfileName(null)
  }

  function handleOnboardingComplete() {
    setShowOnboarding(false)
    bridge.getProfile().then(p => {
      if (p?.name) setProfileName(p.name)
    })
  }

  // Still checking session
  if (!authChecked) return null

  // No users in the DB yet → first-launch account setup wizard
  if (!hasUsers) {
    return <AccountSetup onComplete={handleSignIn} />
  }

  // Not logged in → show login screen
  if (!currentUser) {
    return <Login onSignIn={handleSignIn} />
  }

  // Tracker role
  if (currentUser.role === 'tracker') {
    return <TrackerApp user={currentUser} onSignOut={handleSignOut} />
  }

  // Admin role — wait for profile load
  if (!appReady) return null

  const PageComponent = adminPages[activePage]

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {showOnboarding && <Onboarding onComplete={handleOnboardingComplete} />}
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar
          activePage={activePage}
          profileName={profileName || currentUser.name}
          syncStatus={syncStatus}
          onSignOut={handleSignOut}
        />
        <main className="flex-1 overflow-y-auto">
          {activePage === 'dashboard'
            ? <Dashboard onSyncRefresh={loadSyncStatus} onLockApp={handleSignOut} />
            : <PageComponent onSyncRefresh={loadSyncStatus} currentUser={currentUser} onNavigate={setActivePage} />
          }
        </main>
      </div>
    </div>
  )
}
