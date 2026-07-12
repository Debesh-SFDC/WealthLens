import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // App lock / auth (legacy — kept for backward compat)
  hasAppPassword:     ()              => ipcRenderer.invoke('auth:hasPassword'),
  isAppUnlocked:      ()              => ipcRenderer.invoke('auth:isUnlocked'),
  verifyAppPassword:  (password)      => ipcRenderer.invoke('auth:verify', password),
  setAppPassword:     (password)      => ipcRenderer.invoke('auth:setPassword', password),
  changeAppPassword:  (data)          => ipcRenderer.invoke('auth:changePassword', data),
  lockApp:            ()              => ipcRenderer.invoke('auth:lock'),
  getAuthLockoutStatus: ()            => ipcRenderer.invoke('auth:getLockoutStatus'),

  // Users & session
  getUsers:           ()              => ipcRenderer.invoke('users:getAll'),
  verifyUserPin:      (data)          => ipcRenderer.invoke('users:verifyPin', data),
  verifyAnyPin:       (pin)           => ipcRenderer.invoke('users:verifyPinAny', pin),
  updateUserProfile:  (data)          => ipcRenderer.invoke('users:updateProfile', data),
  updateUserPin:      (data)          => ipcRenderer.invoke('users:updatePin', data),
  getCurrentSession:  ()              => ipcRenderer.invoke('users:getCurrentSession'),
  signOut:            ()              => ipcRenderer.invoke('users:signOut'),
  refreshActivity:    ()              => ipcRenderer.invoke('users:refreshActivity'),
  getTrackerBudget:   ()              => ipcRenderer.invoke('users:getTrackerBudget'),
  setTrackerBudget:   (amount)        => ipcRenderer.invoke('users:setTrackerBudget', amount),

  // Profile
  getProfile: () => ipcRenderer.invoke('profile:get'),
  saveProfile: (data) => ipcRenderer.invoke('profile:save', data),

  // Goals
  getAllGoals: () => ipcRenderer.invoke('goals:getAll'),
  createGoal: (data) => ipcRenderer.invoke('goals:create', data),
  updateGoal: (data) => ipcRenderer.invoke('goals:update', data),
  deleteGoal: (id) => ipcRenderer.invoke('goals:delete', id),
  syncGoalInvestment: (goalId) => ipcRenderer.invoke('goals:syncLinkedInvestment', goalId),
  getGoalContributions: (goalId) => ipcRenderer.invoke('goalContributions:getAll', goalId),
  addGoalContribution: (data) => ipcRenderer.invoke('goalContributions:create', data),
  deleteGoalContribution: (data) => ipcRenderer.invoke('goalContributions:delete', data),
  getGoalInvestments: (goalId) => ipcRenderer.invoke('goalInvestments:getForGoal', goalId),
  getAllGoalInvestmentLinks: () => ipcRenderer.invoke('goalInvestments:getAllLinks'),
  setGoalInvestments: (goalId, investmentIds) => ipcRenderer.invoke('goalInvestments:setForGoal', { goalId, investmentIds }),
  getGoalsForInvestment: (investmentId) => ipcRenderer.invoke('goalInvestments:getForInvestment', investmentId),

  // Investments
  getAllInvestments: (goalId) => ipcRenderer.invoke('investments:getAll', goalId),
  createInvestment: (data) => ipcRenderer.invoke('investments:create', data),
  updateInvestment: (data) => ipcRenderer.invoke('investments:update', data),
  deleteInvestment: (id) => ipcRenderer.invoke('investments:delete', id),

  // Salary allocations (legacy — kept for Onboarding backward compat)
  getSalaryAllocations: () => ipcRenderer.invoke('salary:getAllocations'),
  replaceAllSalaryAllocations: (data) => ipcRenderer.invoke('salary:replaceAll', data),

  // Salary plans (new versioned system)
  getActivePlan: () => ipcRenderer.invoke('plans:getActive'),
  getAllPlans: () => ipcRenderer.invoke('plans:getAll'),
  getPlanById: (id) => ipcRenderer.invoke('plans:getById', id),
  createPlan: (data) => ipcRenderer.invoke('plans:create', data),
  updatePlanItems: (data) => ipcRenderer.invoke('plans:updateItems', data),

  // Expenses
  getAllExpenses: (filter) => ipcRenderer.invoke('expenses:getAll', filter),
  createExpense: (data) => ipcRenderer.invoke('expenses:create', data),
  updateExpense: (data) => ipcRenderer.invoke('expenses:update', data),
  deleteExpense: (id) => ipcRenderer.invoke('expenses:delete', id),
  getExpenseCategories: () => ipcRenderer.invoke('expenses:getCategories'),
  createExpenseCategory: (data) => ipcRenderer.invoke('expenses:createCategory', data),
  deleteExpenseCategory: (id) => ipcRenderer.invoke('expenses:deleteCategory', id),
  getExpenseMonthlyStats: (filter) => ipcRenderer.invoke('expenses:getMonthlyStats', filter),

  // Dashboard
  getDashboardStats: () => ipcRenderer.invoke('dashboard:getStats'),

  // External price / NAV APIs
  searchMF: (query) => ipcRenderer.invoke('api:searchMF', query),
  fetchMFNav: (schemeCode) => ipcRenderer.invoke('api:fetchMFNav', schemeCode),
  fetchStockPrice: (symbol, exchange) => ipcRenderer.invoke('api:fetchStockPrice', symbol, exchange),
  fetchGoldPrice: () => ipcRenderer.invoke('api:fetchGoldPrice'),

  // Google Drive
  getDriveStatus: () => ipcRenderer.invoke('drive:getStatus'),
  getDriveSyncStatus: () => ipcRenderer.invoke('drive:getSyncStatus'),
  getDriveDbLastModified: () => ipcRenderer.invoke('drive:getDbLastModified'),
  hasDriveCreds: () => ipcRenderer.invoke('drive:hasCreds'),
  getDriveCredentials: () => ipcRenderer.invoke('drive:getCreds'),
  saveDriveCredentials: (clientId, clientSecret) => ipcRenderer.invoke('drive:saveCredentials', clientId, clientSecret),
  getInstalledBrowsers: () => ipcRenderer.invoke('drive:getInstalledBrowsers'),
  connectDrive: (browserApp) => ipcRenderer.invoke('drive:connect', browserApp),
  disconnectDrive: () => ipcRenderer.invoke('drive:disconnect'),
  driveBackupNow:     () => ipcRenderer.invoke('drive:backup'),
  driveSyncPush:      () => ipcRenderer.invoke('drive:syncPush'),
  driveSyncPull:      () => ipcRenderer.invoke('drive:syncPull'),
  syncNow:            () => ipcRenderer.invoke('sync:now'),
  getSyncLog:         () => ipcRenderer.invoke('sync:getLog'),
  getDeviceId:        () => ipcRenderer.invoke('sync:getDeviceId'),
  // Push notification from main when a Drive API call hits invalid_grant (expired/
  // revoked refresh token) — main already cleared the stale tokens by the time this
  // fires. Returns an unsubscribe function. contextIsolation-safe: we don't expose
  // raw ipcRenderer, just this one listener.
  onDriveDisconnected: (callback) => {
    const listener = (_event, message) => callback(message)
    ipcRenderer.on('drive:disconnected', listener)
    return () => ipcRenderer.removeListener('drive:disconnected', listener)
  },
  listDriveBackups: () => ipcRenderer.invoke('drive:listBackups'),
  driveRestore: (fileId) => ipcRenderer.invoke('drive:restore', fileId),
  getDriveAutoBackup: () => ipcRenderer.invoke('drive:getAutoBackup'),
  setDriveAutoBackup: (val) => ipcRenderer.invoke('drive:setAutoBackup', val),

  // Weight tracking
  logWeight:              (data)   => ipcRenderer.invoke('weight:log', data),
  getWeightLogs:          (filter) => ipcRenderer.invoke('weight:getAll', filter),
  deleteWeightLog:        (id)     => ipcRenderer.invoke('weight:delete', id),
  saveWeightProfile:      (data)   => ipcRenderer.invoke('weight:saveProfile', data),
  getWeightProfile:       (userId) => ipcRenderer.invoke('weight:getProfile', userId),
  getAllWeightLogsAdmin:   ()       => ipcRenderer.invoke('weight:getAllForAdmin'),
  getUsersWithWeightProfile: ()    => ipcRenderer.invoke('weight:getUsersWithProfile'),
  importPhoneData: (filePath, userId) => ipcRenderer.invoke('phone:import', filePath, userId),

  // Rebalancing actions
  rebalancingGetAll: () => ipcRenderer.invoke('rebalancing:getAll'),
  rebalancingUpsert: (text, status) => ipcRenderer.invoke('rebalancing:upsert', text, status),
})
