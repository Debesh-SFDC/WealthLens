const IS_ELECTRON = typeof window !== 'undefined' && window.electronAPI !== undefined

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

function getToken() {
  return localStorage.getItem('wealthlens_token') || ''
}

async function webCall(method, endpoint, body) {
  const res = await fetch(`${API_BASE}/api${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  // Only treat 401 as "session expired" when a token was actually sent —
  // login/bootstrap also return 401 for wrong credentials with no token yet,
  // and those need to reach the caller as a normal thrown error instead.
  if (res.status === 401 && getToken()) {
    localStorage.removeItem('wealthlens_token')
    window.location.href = '/'
    return null
  }
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

const bridge = {
  // Goals — real preload names
  getAllGoals: () => IS_ELECTRON
    ? window.electronAPI.getAllGoals()
    : webCall('GET', '/goals'),
  createGoal: (data) => IS_ELECTRON
    ? window.electronAPI.createGoal(data)
    : webCall('POST', '/goals', data),
  updateGoal: (data) => IS_ELECTRON
    ? window.electronAPI.updateGoal(data)
    : webCall('PUT', `/goals/${data.id}`, data),
  deleteGoal: (id) => IS_ELECTRON
    ? window.electronAPI.deleteGoal(id)
    : webCall('DELETE', `/goals/${id}`),

  // Investments — real preload names
  getAllInvestments: (goalId) => IS_ELECTRON
    ? window.electronAPI.getAllInvestments(goalId)
    : webCall('GET', goalId ? `/investments?goalId=${goalId}` : '/investments'),
  createInvestment: (data) => IS_ELECTRON
    ? window.electronAPI.createInvestment(data)
    : webCall('POST', '/investments', data),
  updateInvestment: (data) => IS_ELECTRON
    ? window.electronAPI.updateInvestment(data)
    : webCall('PUT', `/investments/${data.id}`, data),
  deleteInvestment: (id) => IS_ELECTRON
    ? window.electronAPI.deleteInvestment(id)
    : webCall('DELETE', `/investments/${id}`),

  // Expenses — real preload names
  getAllExpenses: (filter) => IS_ELECTRON
    ? window.electronAPI.getAllExpenses(filter)
    : webCall('GET', `/expenses?${new URLSearchParams(filter || {})}`),
  createExpense: (data) => IS_ELECTRON
    ? window.electronAPI.createExpense(data)
    : webCall('POST', '/expenses', data),
  updateExpense: (data) => IS_ELECTRON
    ? window.electronAPI.updateExpense(data)
    : webCall('PUT', `/expenses/${data.id}`, data),
  deleteExpense: (id) => IS_ELECTRON
    ? window.electronAPI.deleteExpense(id)
    : webCall('DELETE', `/expenses/${id}`),

  // Salary plans — real preload names
  getActivePlan: () => IS_ELECTRON
    ? window.electronAPI.getActivePlan()
    : webCall('GET', '/salary-plans/active'),
  getAllPlans: () => IS_ELECTRON
    ? window.electronAPI.getAllPlans()
    : webCall('GET', '/salary-plans'),
  getPlanById: (id) => IS_ELECTRON
    ? window.electronAPI.getPlanById(id)
    : webCall('GET', `/salary-plans/${id}`),
  createPlan: (data) => IS_ELECTRON
    ? window.electronAPI.createPlan(data)
    : webCall('POST', '/salary-plans', data),
  // NOTE: the IPC handler (plans:updateItems) destructures `{ planId, ... }`,
  // not `id` — callers (e.g. SalaryAllocator.jsx) already pass `planId`.
  // The server route is PUT /salary-plans/:id (no /items suffix).
  updatePlanItems: (data) => IS_ELECTRON
    ? window.electronAPI.updatePlanItems(data)
    : webCall('PUT', `/salary-plans/${data.planId}`, data),

  // Profile — real preload names
  getProfile: () => IS_ELECTRON
    ? window.electronAPI.getProfile()
    : webCall('GET', '/profile'),
  saveProfile: (data) => IS_ELECTRON
    ? window.electronAPI.saveProfile(data)
    : webCall('PUT', '/profile', data),

  // Sync
  syncNow: () => IS_ELECTRON
    ? window.electronAPI.syncNow()
    : webCall('POST', '/sync'),

  // Auth — mobile + password (replaces per-user PIN login everywhere)
  login: (data) => IS_ELECTRON
    ? window.electronAPI.login(data)
    : webCall('POST', '/auth/login', data),
  // First-launch only — creates the admin account. Guarded server/main-side.
  bootstrap: (data) => IS_ELECTRON
    ? window.electronAPI.bootstrap(data)
    : webCall('POST', '/auth/bootstrap', data),
  hasAnyUser: () => IS_ELECTRON
    ? window.electronAPI.hasAnyUser()
    : webCall('GET', '/auth/bootstrap-status').then(r => r.hasUsers),

  // Users — admin-only management (name/mobile/password, no role changes)
  getUsers: () => IS_ELECTRON
    ? window.electronAPI.getUsers()
    : webCall('GET', '/users'),
  updateUser: (data) => IS_ELECTRON
    ? window.electronAPI.updateUser(data)
    : webCall('PUT', `/users/${data.id}`, data),
  createUser: (data) => IS_ELECTRON
    ? window.electronAPI.createUser(data)
    : webCall('POST', '/users', data),
  deleteUser: (id) => IS_ELECTRON
    ? window.electronAPI.deleteUser(id)
    : webCall('DELETE', `/users/${id}`),

  // Dashboard
  getDashboardStats: () => IS_ELECTRON
    ? window.electronAPI.getDashboardStats()
    : webCall('GET', '/dashboard/stats'),

  // Weight — always the caller's own entries
  logWeight: (data) => IS_ELECTRON
    ? window.electronAPI.logWeight(data)
    : webCall('POST', '/weight', data),
}

export default bridge
