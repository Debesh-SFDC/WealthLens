import { useState } from 'react'

const TABS = [
  {
    id: 'dashboard', label: 'Home',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" />
      </svg>
    ),
  },
  {
    id: 'expenses', label: 'Expenses',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
  },
  {
    id: 'health', label: 'Health',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    ),
  },
  {
    id: 'investments', label: 'Invest',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
      </svg>
    ),
  },
]

const MORE_ITEMS = [
  { id: 'goals',   label: 'Goals' },
  { id: 'travel',  label: 'Travel' },
  { id: 'salary',  label: 'Salary Allocator' },
  { id: 'networth',label: 'Net Worth' },
  { id: 'fire',    label: 'FIRE Planner' },
  { id: 'settings',label: 'Settings' },
]

function TabButton({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex flex-col items-center justify-center gap-0.5 h-full min-w-[44px] min-h-[44px]"
      style={{ color: active ? '#6C63FF' : 'rgba(255,255,255,0.45)' }}
    >
      {icon}
      <span className="text-[10px] font-semibold">{label}</span>
    </button>
  )
}

export default function BottomNav({ activePage, onNavigate }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const isMoreActive = MORE_ITEMS.some(i => i.id === activePage)

  function go(id) {
    setMoreOpen(false)
    onNavigate(id)
  }

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute bottom-[64px] left-0 right-0 bg-white rounded-t-2xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-2 py-2">
              {MORE_ITEMS.map(item => (
                <button
                  key={item.id}
                  onClick={() => go(item.id)}
                  className="w-full flex items-center px-4 py-3.5 min-h-[44px] rounded-xl text-sm font-semibold transition-colors"
                  style={{
                    backgroundColor: activePage === item.id ? '#F0EFFF' : 'transparent',
                    color: activePage === item.id ? '#6C63FF' : '#374151',
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav
        className="fixed bottom-0 left-0 right-0 z-30 flex items-stretch h-16 lg:hidden"
        style={{ backgroundColor: '#1a1a2e', borderTop: '1px solid rgba(255,255,255,0.08)' }}
      >
        {TABS.map(tab => (
          <TabButton
            key={tab.id}
            active={activePage === tab.id}
            onClick={() => go(tab.id)}
            icon={tab.icon}
            label={tab.label}
          />
        ))}
        <TabButton
          active={isMoreActive || moreOpen}
          onClick={() => setMoreOpen(o => !o)}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
            </svg>
          }
          label="More"
        />
      </nav>
    </>
  )
}
