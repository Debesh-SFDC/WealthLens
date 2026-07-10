const TABS = [
  {
    id: 'home', label: 'Home',
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={active ? 0 : 2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
  },
  {
    id: 'dashboard', label: 'Charts',
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <rect x="18" y="3" width="4" height="18" rx="1" fill={active ? 'currentColor' : 'none'}/>
        <rect x="10" y="8" width="4" height="13" rx="1" fill={active ? 'currentColor' : 'none'}/>
        <rect x="2"  y="13" width="4" height="8"  rx="1" fill={active ? 'currentColor' : 'none'}/>
      </svg>
    ),
  },
  {
    id: 'insights', label: 'Insights',
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 16v-4M12 8h.01" strokeWidth={active ? 2.5 : 2}/>
      </svg>
    ),
  },
  {
    id: 'categories', label: 'Categories',
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <rect x="3" y="3" width="7" height="7" rx="1" fill={active ? 'currentColor' : 'none'}/>
        <rect x="14" y="3" width="7" height="7" rx="1" fill={active ? 'currentColor' : 'none'}/>
        <rect x="3" y="14" width="7" height="7" rx="1" fill={active ? 'currentColor' : 'none'}/>
        <rect x="14" y="14" width="7" height="7" rx="1" fill={active ? 'currentColor' : 'none'}/>
      </svg>
    ),
  },
  {
    id: 'settings', label: 'Settings',
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    ),
  },
]

export default function BottomNav({ active, onSelect }) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 flex items-center justify-around px-2"
      style={{
        height: 68,
        background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(0,0,0,0.06)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        zIndex: 100,
      }}
    >
      {TABS.map(tab => {
        const isActive = active === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            className="flex flex-col items-center justify-center gap-0.5 flex-1 py-2 rounded-xl transition-all"
            style={{ color: isActive ? '#6C63FF' : '#9CA3AF' }}
          >
            {tab.icon(isActive)}
            <span className="text-xs font-semibold" style={{ fontSize: 10 }}>{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
