import { useState, useEffect, useCallback } from 'react'
import bridge from './lib/bridge'
import Sidebar from './components/Sidebar'
import BottomNav from './components/BottomNav'
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
import TravelPage from './pages/TravelPage'
import Settings from './pages/Settings'
import TrackerApp from './components/TrackerApp'
import AdminWeight from './pages/AdminWeight'
import TasksAndIdeas from './pages/TasksAndIdeas'
import DeskMode from './pages/DeskMode'

const adminPages = {
  dashboard:   Dashboard,
  investments: Investments,
  expenses:    Expenses,
  networth:    NetWorth,
  fire:        FirePlannerPage,
  'goals-wishlist': Goals,  // legacy id kept so saved navigation still lands here
  goals:       Goals,
  wishlist:    Goals,          // wishlist was merged into goals
  salary:      SalaryAllocator,
  travel:      TravelPage,
  settings:    Settings,
  health:      AdminWeight,
  tasks:       TasksAndIdeas,
}

const IS_ELECTRON = typeof window !== 'undefined' && window.electronAPI !== undefined
const TOKEN_KEY = 'wealthlens_token'
// Desk Mode lives at /desk in web mode (deep-linkable, survives reloads). The
// Electron renderer is loaded from a file/dev URL, so there it's state only.
const DESK_PATH = '/desk'
const isDeskPath = () => !IS_ELECTRON && window.location.pathname === DESK_PATH

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
  const [deskMode, setDeskMode]             = useState(isDeskPath)

  // Browser back/forward in and out of /desk
  useEffect(() => {
    if (IS_ELECTRON) return
    const onPop = () => setDeskMode(isDeskPath())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function enterDeskMode() {
    if (!IS_ELECTRON) window.history.pushState({ desk: true }, '', DESK_PATH)
    setDeskMode(true)
  }

  const exitDeskMode = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    if (!IS_ELECTRON && isDeskPath()) {
      // Entered from the app → pop back; deep-linked → just swap the URL.
      if (window.history.state?.desk) window.history.back()
      else window.history.replaceState(null, '', '/')
    }
    setDeskMode(false)
  }, [])

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
  // Onboarding.jsx (profile/goal/salary wizard) is Electron-only — web mode
  // goes straight to the Dashboard after AccountSetup, blank profile or not.
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'admin') return
    bridge.getProfile()
      .then(profile => {
        if (IS_ELECTRON && (!profile || !profile.name)) setShowOnboarding(true)
        else setProfileName(profile?.name || '')
        setAppReady(true)
      })
      .catch(() => { if (IS_ELECTRON) setShowOnboarding(true); setAppReady(true) })
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

  if (deskMode) {
    return <DeskMode profileName={profileName || currentUser.name} onExit={exitDeskMode} />
  }

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
          onDeskMode={enterDeskMode}
        />
        <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">
          {activePage === 'dashboard'
            ? <Dashboard onNavigate={setActivePage} currentUser={currentUser} />
            : <PageComponent onSyncRefresh={loadSyncStatus} currentUser={currentUser} onNavigate={setActivePage} />
          }
        </main>
      </div>
      <BottomNav activePage={activePage} onNavigate={setActivePage} />
    </div>
  )
}
