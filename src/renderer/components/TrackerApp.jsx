import { useState } from 'react'
import AppLogoIcon from './AppLogoIcon'
import TrackerHome from '../pages/TrackerHome'
import TrackerDashboard from '../pages/TrackerDashboard'
import TrackerInsights from '../pages/TrackerInsights'
import TrackerCategories from '../pages/TrackerCategories'
import TrackerWeight from '../pages/TrackerWeight'

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
      <polyline points="9 21 9 12 15 12 15 21" />
    </svg>
  )
}

function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}

function InsightsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M12 2a7 7 0 0 1 7 7c0 2.6-1.4 4.9-3.5 6.2V17a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-1.8C6.4 13.9 5 11.6 5 9a7 7 0 0 1 7-7z" />
      <line x1="9" y1="21" x2="15" y2="21" />
      <line x1="10" y1="19" x2="14" y2="19" />
    </svg>
  )
}

function CategoriesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <circle cx="9" cy="9" r="3" />
      <circle cx="15" cy="15" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
    </svg>
  )
}

function WeightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M6 2h12l2 6H4L6 2z" />
      <rect x="3" y="8" width="18" height="13" rx="2" />
      <line x1="12" y1="12" x2="12" y2="17" />
      <line x1="9.5" y1="14.5" x2="14.5" y2="14.5" />
    </svg>
  )
}

function SignOutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

const navItems = [
  { id: 'home',       label: 'Home',       Icon: HomeIcon },
  { id: 'dashboard',  label: 'Dashboard',  Icon: DashboardIcon },
  { id: 'insights',   label: 'Insights',   Icon: InsightsIcon },
  { id: 'categories', label: 'Categories', Icon: CategoriesIcon },
  { id: 'weight',     label: 'Weight',     Icon: WeightIcon },
]

function NavButton({ item, isActive, onClick }) {
  const { label, Icon } = item
  return (
    <button
      onClick={onClick}
      className="flex items-center w-full gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150"
      style={{
        backgroundColor: isActive ? '#6C63FF' : 'transparent',
        color: isActive ? '#ffffff' : 'rgba(255,255,255,0.4)',
        boxShadow: isActive ? '0 4px 14px rgba(108,99,255,0.35)' : 'none',
      }}
      onMouseEnter={e => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.07)'
          e.currentTarget.style.color = 'rgba(255,255,255,0.85)'
        }
      }}
      onMouseLeave={e => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = 'transparent'
          e.currentTarget.style.color = 'rgba(255,255,255,0.4)'
        }
      }}
    >
      <Icon />
      <span>{label}</span>
      {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white opacity-80" />}
    </button>
  )
}

export default function TrackerApp({ user, onSignOut }) {
  const [page, setPage] = useState('home')

  const initials = (user.name || 'T').charAt(0).toUpperCase()

  const avatarColors = ['#6C63FF', '#EC4899', '#10B981', '#F59E0B', '#06B6D4']
  const avatarBg = avatarColors[(user.name || '').charCodeAt(0) % avatarColors.length] || '#6C63FF'

  return (
    <div className="flex h-screen overflow-hidden">
      <aside
        className="flex flex-col shrink-0 h-screen"
        style={{
          width: 224,
          background: 'linear-gradient(180deg, #0F0E1A 0%, #13112A 100%)',
        }}
      >
        <div className="flex items-center gap-3 px-5 py-6">
          <AppLogoIcon size={36} />
          <span className="text-white font-bold text-lg tracking-tight">WealthLens</span>
        </div>

        <div className="mx-5 mb-4" style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.08)' }} />

        <div className="mx-3 mb-4 rounded-xl px-3 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center rounded-full shrink-0 text-white font-bold text-base"
              style={{ width: 38, height: 38, backgroundColor: avatarBg }}
            >
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-semibold truncate">{user.name}</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Tracker</p>
            </div>
          </div>
        </div>

        <p className="px-5 mb-2 text-xs font-semibold tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>
          Menu
        </p>

        <nav className="flex-1 px-3 space-y-1">
          {navItems.map(item => (
            <NavButton
              key={item.id}
              item={item}
              isActive={page === item.id}
              onClick={() => setPage(item.id)}
            />
          ))}
        </nav>

        <div className="px-3 pb-5">
          <div className="mb-3" style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.08)' }} />
          <button
            onClick={onSignOut}
            className="flex items-center w-full gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150"
            style={{ color: 'rgba(255,255,255,0.4)' }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.07)'
              e.currentTarget.style.color = 'rgba(255,255,255,0.85)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = 'rgba(255,255,255,0.4)'
            }}
          >
            <SignOutIcon />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-gray-50">
        {page === 'home'       && <TrackerHome       user={user} />}
        {page === 'dashboard'  && <TrackerDashboard  user={user} />}
        {page === 'insights'   && <TrackerInsights   user={user} />}
        {page === 'categories' && <TrackerCategories user={user} />}
        {page === 'weight'     && <TrackerWeight     user={user} />}
      </main>
    </div>
  )
}
