import { useState } from 'react'
import AppLogoIcon from './AppLogoIcon'
import TrackerHome from '../pages/TrackerHome'
import TrackerMonth from '../pages/TrackerMonth'
import TrackerDashboard from '../pages/TrackerDashboard'
import TrackerInsights from '../pages/TrackerInsights'
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

function ExpensesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M6 2h12v19l-3-2-3 2-3-2-3 2V2z" />
      <line x1="9" y1="7" x2="15" y2="7" />
      <line x1="9" y1="11" x2="15" y2="11" />
      <line x1="9" y1="15" x2="13" y2="15" />
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
  { id: 'expenses',   label: 'Expenses',   Icon: ExpensesIcon },
  { id: 'dashboard',  label: 'Dashboard',  Icon: DashboardIcon },
  { id: 'insights',   label: 'Insights',   Icon: InsightsIcon },
  { id: 'weight',     label: 'Weight',     Icon: WeightIcon },
]

function NavButton({ item, isActive, onClick }) {
  const { label, Icon } = item
  return (
    <button
      onClick={onClick}
      className="flex items-center w-full gap-3 px-3 py-2.5 rounded-r-xl text-sm font-medium transition-all duration-150"
      style={{
        background: isActive ? 'linear-gradient(90deg, rgba(212,175,55,0.08) 0%, transparent 100%)' : 'transparent',
        borderLeft: `3px solid ${isActive ? '#D4AF37' : 'transparent'}`,
        color: isActive ? '#D4AF37' : '#606060',
      }}
      onMouseEnter={e => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = 'rgba(212,175,55,0.05)'
          e.currentTarget.style.color = '#A0A0A0'
        }
      }}
      onMouseLeave={e => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = 'transparent'
          e.currentTarget.style.color = '#606060'
        }
      }}
    >
      <Icon />
      <span>{label}</span>
    </button>
  )
}

function TrackerBottomNav({ page, onNavigate }) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 flex items-stretch h-16 lg:hidden"
      style={{ backgroundColor: '#050505', borderTop: '1px solid #2A2A2A' }}
    >
      {navItems.map(item => {
        const isActive = page === item.id
        const { Icon, label } = item
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className="relative flex-1 flex flex-col items-center justify-center gap-0.5 h-full min-w-[44px] min-h-[44px]"
            style={{ color: isActive ? '#D4AF37' : '#404040' }}
          >
            {isActive && <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-b-full" style={{ backgroundColor: '#D4AF37', boxShadow: '0 0 10px rgba(212,175,55,0.6)' }} />}
            <Icon />
            <span className="text-[10px] font-semibold">{label}</span>
          </button>
        )
      })}
    </nav>
  )
}

export default function TrackerApp({ user, onSignOut }) {
  const [page, setPage] = useState('home')

  const initials = (user.name || 'T').charAt(0).toUpperCase()

  
  return (
    <div className="flex h-screen overflow-hidden">
      <aside
        className="hidden lg:flex flex-col shrink-0 h-screen"
        style={{
          width: 224,
          backgroundColor: '#050505',
          borderRight: '1px solid #1A1A1A',
        }}
      >
        <div className="flex items-center gap-3 px-5 py-6">
          <AppLogoIcon size={36} />
          <span className="font-bold text-lg tracking-tight" style={{ color: '#D4AF37', textShadow: '0 0 18px rgba(212,175,55,0.35)' }}>Lifelog</span>
        </div>

        <div className="mx-5 mb-4" style={{ height: 1, backgroundColor: '#1A1A1A' }} />

        <div className="mx-3 mb-4 rounded-xl px-3 py-3" style={{ backgroundColor: '#111111', border: '1px solid #2A2A2A' }}>
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center rounded-full shrink-0 text-[#0A0A0A] font-bold text-base"
              style={{ width: 38, height: 38, background: 'linear-gradient(135deg, #D4AF37, #B8960C)' }}
            >
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-semibold truncate">{user.name}</p>
              <p className="text-xs" style={{ color: '#606060' }}>Tracker</p>
            </div>
          </div>
        </div>

        <p className="px-5 mb-2 text-xs font-semibold tracking-widest uppercase" style={{ color: '#404040' }}>
          Menu
        </p>

        <nav className="flex-1 pr-3 space-y-1">
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
          <div className="mb-3" style={{ height: 1, background: 'linear-gradient(90deg, #D4AF37 0%, transparent 100%)', opacity: 0.6 }} />
          <button
            onClick={onSignOut}
            className="flex items-center w-full gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150"
            style={{ color: '#606060' }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = 'rgba(231,76,60,0.08)'
              e.currentTarget.style.color = '#E74C3C'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = '#606060'
            }}
          >
            <SignOutIcon />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-[#0A0A0A] pb-16 lg:pb-0">
        {page === 'home'       && <TrackerHome       user={user} />}
        {page === 'expenses'   && <TrackerMonth      user={user} />}
        {page === 'dashboard'  && <TrackerDashboard  user={user} />}
        {page === 'insights'   && <TrackerInsights   user={user} />}
        {page === 'weight'     && <TrackerWeight     user={user} />}
      </main>

      <TrackerBottomNav page={page} onNavigate={setPage} />
    </div>
  )
}
