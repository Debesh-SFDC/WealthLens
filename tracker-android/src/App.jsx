import { useState, useEffect } from 'react'
import { openDb, hasPin } from './db/index.js'
import PinLock from './components/PinLock.jsx'
import BottomNav from './components/BottomNav.jsx'
import TrackerHome from './pages/TrackerHome.jsx'
import TrackerDashboard from './pages/TrackerDashboard.jsx'
import TrackerInsights from './pages/TrackerInsights.jsx'
import TrackerCategories from './pages/TrackerCategories.jsx'
import TrackerSettings from './pages/TrackerSettings.jsx'

export default function App() {
  const [ready, setReady]       = useState(false)
  const [firstTime, setFirstTime] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [tab, setTab]           = useState('home')

  useEffect(() => {
    openDb()
      .then(async () => {
        const exists = await hasPin()
        setFirstTime(!exists)
        setReady(true)
      })
      .catch(err => {
        console.error('DB init failed', err)
        setReady(true)
      })
  }, [])

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-screen"
        style={{ background: 'linear-gradient(160deg, #0D0B26 0%, #1E1A6E 100%)' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #6C63FF, #4338CA)' }}>
            <svg viewBox="0 0 40 40" fill="none" className="w-8 h-8">
              <circle cx="18" cy="18" r="10" stroke="#FFD700" strokeWidth="2.5"/>
              <line x1="25" y1="25" x2="34" y2="34" stroke="#FFD700" strokeWidth="2.5" strokeLinecap="round"/>
              <polyline points="12,20 16,15 20,18 24,12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </div>
          <p className="text-white font-bold text-lg">WealthLens</p>
        </div>
      </div>
    )
  }

  if (!unlocked) {
    return (
      <PinLock
        isFirstTime={firstTime}
        onUnlock={() => { setFirstTime(false); setUnlocked(true) }}
      />
    )
  }

  const pages = {
    home:       <TrackerHome />,
    dashboard:  <TrackerDashboard />,
    insights:   <TrackerInsights />,
    categories: <TrackerCategories />,
    settings:   <TrackerSettings onLock={() => setUnlocked(false)} />,
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FF' }}>
      {pages[tab]}
      <BottomNav active={tab} onSelect={setTab} />
    </div>
  )
}
