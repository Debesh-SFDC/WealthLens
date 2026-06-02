import { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import Onboarding from './components/Onboarding'
import Dashboard from './pages/Dashboard'
import Goals from './pages/Goals'
import Investments from './pages/Investments'
import Expenses from './pages/Expenses'
import SalaryAllocator from './pages/SalaryAllocator'
import Settings from './pages/Settings'

const pages = {
  dashboard:   Dashboard,
  goals:       Goals,
  investments: Investments,
  expenses:    Expenses,
  salary:      SalaryAllocator,
  settings:    Settings,
}

export default function App() {
  const [activePage, setActivePage]         = useState('dashboard')
  const [profileName, setProfileName]       = useState(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [appReady, setAppReady]             = useState(false)
  const [syncStatus, setSyncStatus]         = useState(null)

  // ── Load sync status (called on mount and periodically) ───────────────
  const loadSyncStatus = useCallback(async () => {
    try {
      const s = await window.electronAPI.getDriveSyncStatus()
      setSyncStatus(s)
    } catch {}
  }, [])

  // ── Bootstrap ─────────────────────────────────────────────────────────
  useEffect(() => {
    window.electronAPI.getProfile()
      .then(profile => {
        if (!profile || !profile.name) setShowOnboarding(true)
        else setProfileName(profile.name)
        setAppReady(true)
      })
      .catch(() => { setShowOnboarding(true); setAppReady(true) })
  }, [])

  // ── Sync status polling (every 30 s) ──────────────────────────────────
  useEffect(() => {
    loadSyncStatus()
    const id = setInterval(loadSyncStatus, 30_000)
    return () => clearInterval(id)
  }, [loadSyncStatus])

  function handleOnboardingComplete() {
    setShowOnboarding(false)
    window.electronAPI.getProfile().then(p => {
      if (p?.name) setProfileName(p.name)
    })
  }

  if (!appReady) return null

  const PageComponent = pages[activePage]

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {showOnboarding && <Onboarding onComplete={handleOnboardingComplete} />}

      <Sidebar activePage={activePage} onNavigate={setActivePage} />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar activePage={activePage} profileName={profileName} syncStatus={syncStatus} />
        <main className="flex-1 overflow-y-auto">
          <PageComponent onSyncRefresh={loadSyncStatus} />
        </main>
      </div>
    </div>
  )
}
