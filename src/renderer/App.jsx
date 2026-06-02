import { useState } from 'react'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import Dashboard from './pages/Dashboard'
import Goals from './pages/Goals'
import Investments from './pages/Investments'
import Expenses from './pages/Expenses'
import SalaryAllocator from './pages/SalaryAllocator'

const pages = {
  dashboard: Dashboard,
  goals: Goals,
  investments: Investments,
  expenses: Expenses,
  salary: SalaryAllocator,
}

export default function App() {
  const [activePage, setActivePage] = useState('dashboard')
  const PageComponent = pages[activePage]

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar activePage={activePage} onNavigate={setActivePage} />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar activePage={activePage} />
        <main className="flex-1 overflow-y-auto">
          <PageComponent />
        </main>
      </div>
    </div>
  )
}
