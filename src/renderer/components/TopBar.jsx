const PAGE_TITLES = {
  dashboard:   'Dashboard',
  goals:       'Goals',
  investments: 'Investments',
  expenses:    'Expenses',
  salary:      'Salary Allocator',
  settings:    'Settings',
}

const SYNC_META = {
  synced:       { color: '#10B981', label: 'Synced with Google Drive' },
  unsynced:     { color: '#F59E0B', label: 'Unsynced changes — backup recommended' },
  failed:       { color: '#EF4444', label: 'Last backup failed' },
  disconnected: null,
}

function getMonthYear() {
  return new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

function getInitials(name) {
  if (!name) return 'U'
  return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

export default function TopBar({ activePage, profileName, syncStatus }) {
  const syncMeta = syncStatus ? SYNC_META[syncStatus.status] : null

  return (
    <header className="flex items-center justify-between px-8 py-4 bg-white border-b border-gray-100 shrink-0">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{PAGE_TITLES[activePage]}</h1>
      </div>

      <div className="flex items-center gap-4">
        {/* Month/Year badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200">
          <svg
            viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
            className="w-4 h-4 text-gray-400"
          >
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <span className="text-sm font-medium text-gray-600">{getMonthYear()}</span>
        </div>

        {/* Drive sync status dot */}
        {syncMeta && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold cursor-default"
            style={{
              backgroundColor: syncMeta.color + '15',
              borderColor: syncMeta.color + '40',
              color: syncMeta.color,
            }}
            title={syncMeta.label}
          >
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{
                backgroundColor: syncMeta.color,
                boxShadow: `0 0 0 3px ${syncMeta.color}30`,
              }}
            />
            {syncStatus.status === 'synced'   && 'Synced'}
            {syncStatus.status === 'unsynced' && 'Unsynced'}
            {syncStatus.status === 'failed'   && 'Sync failed'}
          </div>
        )}

        {/* Avatar */}
        <div className="flex items-center gap-2">
          {profileName && (
            <span className="text-sm font-medium text-gray-600">{profileName}</span>
          )}
          <div
            className="flex items-center justify-center w-8 h-8 rounded-full text-white text-xs font-bold shrink-0"
            style={{ backgroundColor: '#6C63FF' }}
            title={profileName || 'User'}
          >
            {getInitials(profileName)}
          </div>
        </div>
      </div>
    </header>
  )
}
