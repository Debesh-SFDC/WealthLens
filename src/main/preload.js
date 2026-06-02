import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Profile
  getProfile: () => ipcRenderer.invoke('profile:get'),
  saveProfile: (data) => ipcRenderer.invoke('profile:save', data),

  // Goals
  getAllGoals: () => ipcRenderer.invoke('goals:getAll'),
  createGoal: (data) => ipcRenderer.invoke('goals:create', data),
  updateGoal: (data) => ipcRenderer.invoke('goals:update', data),
  deleteGoal: (id) => ipcRenderer.invoke('goals:delete', id),

  // Investments
  getAllInvestments: (goalId) => ipcRenderer.invoke('investments:getAll', goalId),
  createInvestment: (data) => ipcRenderer.invoke('investments:create', data),
  updateInvestment: (data) => ipcRenderer.invoke('investments:update', data),
  deleteInvestment: (id) => ipcRenderer.invoke('investments:delete', id),

  // Salary allocations
  getSalaryAllocations: () => ipcRenderer.invoke('salary:getAllocations'),
  createSalaryAllocation: (data) => ipcRenderer.invoke('salary:createAllocation', data),
  updateSalaryAllocation: (data) => ipcRenderer.invoke('salary:updateAllocation', data),
  deleteSalaryAllocation: (id) => ipcRenderer.invoke('salary:deleteAllocation', id),
  replaceAllSalaryAllocations: (data) => ipcRenderer.invoke('salary:replaceAll', data),

  // Expenses
  getAllExpenses: (filter) => ipcRenderer.invoke('expenses:getAll', filter),
  createExpense: (data) => ipcRenderer.invoke('expenses:create', data),
  updateExpense: (data) => ipcRenderer.invoke('expenses:update', data),
  deleteExpense: (id) => ipcRenderer.invoke('expenses:delete', id),
  getExpenseCategories: () => ipcRenderer.invoke('expenses:getCategories'),
  createExpenseCategory: (data) => ipcRenderer.invoke('expenses:createCategory', data),
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
  hasDriveCreds: () => ipcRenderer.invoke('drive:hasCreds'),
  saveDriveCredentials: (clientId, clientSecret) => ipcRenderer.invoke('drive:saveCredentials', clientId, clientSecret),
  connectDrive: () => ipcRenderer.invoke('drive:connect'),
  disconnectDrive: () => ipcRenderer.invoke('drive:disconnect'),
  driveBackupNow: () => ipcRenderer.invoke('drive:backup'),
  listDriveBackups: () => ipcRenderer.invoke('drive:listBackups'),
  driveRestore: (fileId) => ipcRenderer.invoke('drive:restore', fileId),
  getDriveAutoBackup: () => ipcRenderer.invoke('drive:getAutoBackup'),
  setDriveAutoBackup: (val) => ipcRenderer.invoke('drive:setAutoBackup', val),
})
