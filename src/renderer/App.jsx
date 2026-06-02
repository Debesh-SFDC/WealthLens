import { useState, useEffect } from 'react'
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
  const [activePage, setActivePage]     = useState('dashboard')
  const [profileName, setProfileName]   = useState(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [appReady, setAppReady]         = useState(false)

  useEffect(() => {
    window.electronAPI.getProfile().then(profile => {
      if (!profile || !profile.name) {
        setShowOnboarding(true)
      } else {
        setProfileName(profile.name)
      }
      setAppReady(true)
    }).catch(() => {
      setShowOnboarding(true)
      setAppReady(true)
    })
  }, [])

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
        <TopBar activePage={activePage} profileName={profileName} />
        <main className="flex-1 overflow-y-auto">
          <PageComponent />
        </main>
      </div>
    </div>
  )
}
