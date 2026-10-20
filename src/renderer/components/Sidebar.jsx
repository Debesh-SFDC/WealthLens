import AppLogoIcon from './AppLogoIcon'

const navItems = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    id: 'investments',
    label: 'Investments',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </svg>
    ),
  },
  {
    id: 'expenses',
    label: 'Expenses',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect x="1" y="4" width="22" height="16" rx="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
        <line x1="7" y1="15" x2="7.01" y2="15" strokeWidth={2.5} />
        <line x1="11" y1="15" x2="13" y2="15" />
      </svg>
    ),
  },
  {
    id: 'goals-wishlist',
    label: 'Goals',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    id: 'tasks',
    label: 'Tasks & Ideas',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    id: 'networth',
    label: 'Net Worth',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <polyline points="2 20 7 12 11 16 16 8 22 4" />
        <line x1="2" y1="20" x2="22" y2="20" />
      </svg>
    ),
  },
  {
    id: 'fire',
    label: 'FIRE Planner',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
      </svg>
    ),
  },
  {
    id: 'travel',
    label: 'Travel',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <line x1="3" y1="12" x2="21" y2="12" />
      </svg>
    ),
  },
  {
    id: 'salary',
    label: 'Salary Allocator',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
        <path d="M22 12A10 10 0 0 0 12 2v10z" />
      </svg>
    ),
  },
  {
    id: 'health',
    label: 'Health',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        <line x1="12" y1="9" x2="12" y2="15" />
        <line x1="9" y1="12" x2="15" y2="12" />
      </svg>
    ),
  },
]

const bottomNavItems = [
  {
    id: 'settings',
    label: 'Settings',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    ),
  },
]

function NavButton({ item, isActive, onNavigate }) {
  return (
    <button
      onClick={() => onNavigate(item.id)}
      className="group flex items-center w-full gap-3 px-3 py-2.5 rounded-r-xl text-sm font-medium transition-all duration-150"
      style={{
        background: isActive ? 'linear-gradient(90deg, rgba(212,175,55,0.08) 0%, transparent 100%)' : 'transparent',
        borderLeft: `3px solid ${isActive ? '#D4AF37' : 'transparent'}`,
        color: isActive ? '#D4AF37' : '#F5F5F5',
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = 'rgba(212,175,55,0.05)'
          e.currentTarget.style.color = '#F0D060'
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = 'transparent'
          e.currentTarget.style.color = '#F5F5F5'
        }
      }}
    >
      <span
        className="transition-colors"
        style={{ color: isActive ? '#D4AF37' : undefined, filter: isActive ? 'drop-shadow(0 0 6px rgba(212,175,55,0.45))' : undefined }}
      >
        <span className={isActive ? '' : 'text-[#F5F5F5] group-hover:text-[#F0D060]'}>{item.icon}</span>
      </span>
      <span>{item.label}</span>
    </button>
  )
}

export default function Sidebar({ activePage, onNavigate }) {
  return (
    <aside
      className="hidden lg:flex flex-col w-60 shrink-0 h-screen"
      style={{ backgroundColor: '#050505', borderRight: '1px solid #1A1A1A' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-6">
        <AppLogoIcon size={36} />
        <div>
          <span
            className="font-bold text-lg tracking-tight block"
            style={{ color: '#D4AF37', textShadow: '0 0 18px rgba(212,175,55,0.35)' }}
          >
            Lifelog
          </span>
          <span className="text-[10px] font-medium" style={{ color: '#606060' }}>
            Your life, logged.
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-5 mb-4" style={{ height: 1, backgroundColor: '#1A1A1A' }} />

      {/* Nav label */}
      <p className="px-5 mb-2 text-xs font-semibold tracking-widest uppercase" style={{ color: '#404040' }}>
        Menu
      </p>

      {/* Nav items */}
      <nav className="flex-1 pr-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavButton key={item.id} item={item} isActive={activePage === item.id} onNavigate={onNavigate} />
        ))}
      </nav>

      {/* Bottom nav */}
      <div className="pr-3 pb-2">
        <div className="mb-2 ml-3" style={{ height: 1, background: 'linear-gradient(90deg, #D4AF37 0%, transparent 100%)', opacity: 0.6 }} />
        {bottomNavItems.map((item) => (
          <NavButton key={item.id} item={item} isActive={activePage === item.id} onNavigate={onNavigate} />
        ))}
      </div>

      {/* Version */}
      <div className="px-5 py-3">
        <p className="text-xs" style={{ color: '#404040' }}>Lifelog v1.0.0</p>
      </div>
    </aside>
  )
}
