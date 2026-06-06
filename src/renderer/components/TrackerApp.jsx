import { useState } from 'react'
import TrackerHome from '../pages/TrackerHome'
import TrackerMonth from '../pages/TrackerMonth'

export default function TrackerApp({ user, onSignOut }) {
  const [tab, setTab] = useState('home')

  const tabs = [
    { id: 'home',  label: 'Home',      icon: '🏠' },
    { id: 'month', label: 'This Month', icon: '📅' },
  ]

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'home'  && <TrackerHome  user={user} />}
        {tab === 'month' && <TrackerMonth user={user} />}
      </div>

      {/* Bottom nav */}
      <div className="shrink-0 border-t border-gray-200 bg-white flex items-center px-4 py-2 gap-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl transition-colors"
            style={{ color: tab === t.id ? '#6C63FF' : '#9CA3AF' }}>
            <span className="text-xl">{t.icon}</span>
            <span className="text-[10px] font-semibold">{t.label}</span>
          </button>
        ))}
        <button onClick={onSignOut}
          className="flex flex-col items-center gap-0.5 py-2 px-4 rounded-xl transition-colors"
          style={{ color: '#9CA3AF' }}>
          <span className="text-xl">🚪</span>
          <span className="text-[10px] font-semibold">Sign Out</span>
        </button>
      </div>
    </div>
  )
}
