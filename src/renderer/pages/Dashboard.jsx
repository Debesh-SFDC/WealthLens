import { useState, useEffect } from 'react'

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const statCards = [
  {
    key: 'netWorth',
    label: 'Net Worth',
    format: (v) => INR.format(v),
    icon: '💎',
    accent: '#6C63FF',
    bg: '#f0efff',
    description: 'Current market value of all investments',
  },
  {
    key: 'totalInvested',
    label: 'Total Invested',
    format: (v) => INR.format(v),
    icon: '📈',
    accent: '#10B981',
    bg: '#ecfdf5',
    description: 'Total amount invested across all assets',
  },
  {
    key: 'thisMonthSpend',
    label: 'This Month Spend',
    format: (v) => INR.format(v),
    icon: '💳',
    accent: '#F59E0B',
    bg: '#fffbeb',
    description: 'Total expenses recorded this month',
  },
  {
    key: 'goalsActive',
    label: 'Goals Active',
    format: (v) => v.toString(),
    icon: '🎯',
    accent: '#3B82F6',
    bg: '#eff6ff',
    description: 'Financial goals currently in progress',
  },
]

function StatCard({ label, value, icon, accent, bg, description, loading }) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between mb-4">
        <div
          className="flex items-center justify-center w-12 h-12 rounded-xl text-2xl"
          style={{ backgroundColor: bg }}
        >
          {icon}
        </div>
        <div
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold"
          style={{ backgroundColor: bg, color: accent }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
            <polyline points="17 6 23 6 23 12" />
          </svg>
          Live
        </div>
      </div>

      <div className="space-y-1">
        {loading ? (
          <div className="h-8 w-32 bg-gray-100 rounded-lg animate-pulse" />
        ) : (
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        )}
        <p className="text-sm font-semibold text-gray-700">{label}</p>
        <p className="text-xs text-gray-400">{description}</p>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState({
    netWorth: 0,
    totalInvested: 0,
    thisMonthSpend: 0,
    goalsActive: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.electronAPI
      .getDashboardStats()
      .then((data) => setStats(data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-8">
      {/* Welcome row */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Good morning 👋</h2>
        <p className="mt-1 text-sm text-gray-500">
          Here's a snapshot of your financial health.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">
        {statCards.map((card) => (
          <StatCard
            key={card.key}
            label={card.label}
            value={card.format(stats[card.key])}
            icon={card.icon}
            accent={card.accent}
            bg={card.bg}
            description={card.description}
            loading={loading}
          />
        ))}
      </div>

      {/* Placeholder sections */}
      <div className="grid grid-cols-3 gap-5 mt-8">
        <div className="col-span-2 bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <h3 className="text-base font-semibold text-gray-800 mb-1">Investment Overview</h3>
          <p className="text-xs text-gray-400 mb-6">Performance summary across all assets</p>
          <div className="flex items-center justify-center h-36 rounded-xl bg-gray-50 border border-dashed border-gray-200">
            <p className="text-sm text-gray-400">Chart coming soon</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <h3 className="text-base font-semibold text-gray-800 mb-1">Top Goals</h3>
          <p className="text-xs text-gray-400 mb-6">Closest to completion</p>
          <div className="flex items-center justify-center h-36 rounded-xl bg-gray-50 border border-dashed border-gray-200">
            <p className="text-sm text-gray-400">No goals yet</p>
          </div>
        </div>
      </div>
    </div>
  )
}
