import { useState, useEffect, useCallback } from 'react'
import FirePlanner from '../components/FirePlanner'

export default function FirePlannerPage({ onNavigate }) {
  const [investments, setInvestments] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const inv = await window.electronAPI.getAllInvestments()
      setInvestments(inv || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-gray-900">🔥 FIRE Planner</h2>
        <p className="mt-1 text-sm text-gray-500">Plan your path to Financial Independence, Retire Early</p>
      </div>
      <FirePlanner investments={investments} onNavigate={onNavigate} standalone />
    </div>
  )
}
