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
  getExpenseCategories: () => IS_ELECTRON
    ? window.electronAPI.getExpenseCategories()
    : webCall('GET', '/expenses/categories'),
  getExpenseMonthlyStats: ({ month, year } = {}) => IS_ELECTRON
    ? window.electronAPI.getExpenseMonthlyStats({ month, year })
    : webCall('GET', `/expenses/monthly-stats?${new URLSearchParams({ month, year })}`),
  createExpenseCategory: (data) => IS_ELECTRON
    ? window.electronAPI.createExpenseCategory(data)
    : webCall('POST', '/expenses/categories', data),
  deleteExpenseCategory: (id) => IS_ELECTRON
    ? window.electronAPI.deleteExpenseCategory(id)
    : webCall('DELETE', `/expenses/categories/${id}`),

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
  getWeightLogs: ({ userId, from, to } = {}) => IS_ELECTRON
    ? window.electronAPI.getWeightLogs({ userId, from, to })
    : webCall('GET', `/weight?${new URLSearchParams({ from, to })}`),

  // Weight — admin only, every family member grouped by user
  getAllUsersWeight: () => IS_ELECTRON
    ? window.electronAPI.getAllUsersWeight()
    : webCall('GET', '/weight/all'),

  // Travel — admin only. Electron IPC side isn't wired up yet (the live
  // deployment is web-only) — window.electronAPI.* calls below won't exist
  // in the preload yet; kept for shape-consistency with the rest of bridge.js.
  getAllTrips: () => IS_ELECTRON
    ? window.electronAPI.getAllTrips()
    : webCall('GET', '/travel'),
  getTripById: (id) => IS_ELECTRON
    ? window.electronAPI.getTripById(id)
    : webCall('GET', `/travel/${id}`),
  createTrip: (data) => IS_ELECTRON
    ? window.electronAPI.createTrip(data)
    : webCall('POST', '/travel', data),
  updateTrip: (data) => IS_ELECTRON
    ? window.electronAPI.updateTrip(data)
    : webCall('PUT', `/travel/${data.id}`, data),
  deleteTrip: (id) => IS_ELECTRON
    ? window.electronAPI.deleteTrip(id)
    : webCall('DELETE', `/travel/${id}`),

  // Travel — itinerary
  createItineraryItem: (tripId, data) => IS_ELECTRON
    ? window.electronAPI.createItineraryItem(tripId, data)
    : webCall('POST', `/travel/${tripId}/itinerary`, data),
  updateItineraryItem: (data) => IS_ELECTRON
    ? window.electronAPI.updateItineraryItem(data)
    : webCall('PUT', `/travel/itinerary/${data.id}`, data),
  deleteItineraryItem: (id) => IS_ELECTRON
    ? window.electronAPI.deleteItineraryItem(id)
    : webCall('DELETE', `/travel/itinerary/${id}`),

  // Travel — budget
  createBudgetItem: (tripId, data) => IS_ELECTRON
    ? window.electronAPI.createBudgetItem(tripId, data)
    : webCall('POST', `/travel/${tripId}/budget`, data),
  updateBudgetItem: (data) => IS_ELECTRON
    ? window.electronAPI.updateBudgetItem(data)
    : webCall('PUT', `/travel/budget/${data.id}`, data),
  deleteBudgetItem: (id) => IS_ELECTRON
    ? window.electronAPI.deleteBudgetItem(id)
    : webCall('DELETE', `/travel/budget/${id}`),

  // Travel — packing
  createPackingItem: (tripId, data) => IS_ELECTRON
    ? window.electronAPI.createPackingItem(tripId, data)
    : webCall('POST', `/travel/${tripId}/packing`, data),
  updatePackingItem: (data) => IS_ELECTRON
    ? window.electronAPI.updatePackingItem(data)
    : webCall('PUT', `/travel/packing/${data.id}`, data),
  deletePackingItem: (id) => IS_ELECTRON
    ? window.electronAPI.deletePackingItem(id)
    : webCall('DELETE', `/travel/packing/${id}`),

  // Travel — documents (plain text notes, not file uploads)
  createDocument: (tripId, data) => IS_ELECTRON
    ? window.electronAPI.createDocument(tripId, data)
    : webCall('POST', `/travel/${tripId}/documents`, data),
  updateDocument: (data) => IS_ELECTRON
    ? window.electronAPI.updateDocument(data)
    : webCall('PUT', `/travel/documents/${data.id}`, data),
  deleteDocument: (id) => IS_ELECTRON
    ? window.electronAPI.deleteDocument(id)
    : webCall('DELETE', `/travel/documents/${id}`),

  // Travel — companions (free-text names, not linked to users)
  createCompanion: (tripId, data) => IS_ELECTRON
    ? window.electronAPI.createCompanion(tripId, data)
    : webCall('POST', `/travel/${tripId}/companions`, data),
  updateCompanion: (data) => IS_ELECTRON
    ? window.electronAPI.updateCompanion(data)
    : webCall('PUT', `/travel/companions/${data.id}`, data),
  deleteCompanion: (id) => IS_ELECTRON
    ? window.electronAPI.deleteCompanion(id)
    : webCall('DELETE', `/travel/companions/${id}`),
}

export default bridge
