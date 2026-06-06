import { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import Onboarding from './components/Onboarding'
import ProfileSelector from './components/ProfileSelector'
import Dashboard from './pages/Dashboard'
import Investments from './pages/Investments'
import Expenses from './pages/Expenses'
import SalaryAllocator from './pages/SalaryAllocator'
import NetWorth from './pages/NetWorth'
import Settings from './pages/Settings'
import TrackerApp from './components/TrackerApp'

const adminPages = {
  dashboard:   Dashboard,
  investments: Investments,
  expenses:    Expenses,
  networth:    NetWorth,
  salary:      SalaryAllocator,
  settings:    Settings,
}

export default function App() {
  const [currentUser, setCurrentUser]       = useState(null)  // null = not logged in
  const [authChecked, setAuthChecked]       = useState(false) // waiting for session check
  const [activePage, setActivePage]         = useState('dashboard')
  const [profileName, setProfileName]       = useState(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [appReady, setAppReady]             = useState(false)
  const [syncStatus, setSyncStatus]         = useState(null)

  // ── Session bootstrap ───────────────────────────────────────────────────
  useEffect(() => {
    async function checkSession() {
      try {
        const session = await window.electronAPI.getCurrentSession()
        if (session) {
          setCurrentUser(session)
        }
      } catch {}
      setAuthChecked(true)
    }
    checkSession()
  }, [])

  // ── Load profile / onboarding (Admin only) ───────────────────────────────
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'admin') return
    window.electronAPI.getProfile()
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
    setCurrentUser(user)
    setAppReady(false)
  }

  async function handleSignOut() {
    await window.electronAPI.signOut()
    setCurrentUser(null)
    setAppReady(false)
    setShowOnboarding(false)
    setProfileName(null)
  }

  function handleOnboardingComplete() {
    setShowOnboarding(false)
    window.electronAPI.getProfile().then(p => {
      if (p?.name) setProfileName(p.name)
    })
  }

  // Still checking session
  if (!authChecked) return null

  // Not logged in → show profile selector
  if (!currentUser) {
    return <ProfileSelector onSignIn={handleSignIn} />
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
            : <PageComponent onSyncRefresh={loadSyncStatus} currentUser={currentUser} />
          }
        </main>
      </div>
    </div>
  )
}
