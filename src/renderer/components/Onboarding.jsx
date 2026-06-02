import { useState } from 'react'

const STEPS = ['Your Profile', 'Your First Goal', 'Salary Split']
const GOAL_EMOJIS = ['🎯', '🏠', '🚗', '✈️', '👶', '📚', '💍', '🏖️']

export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0)

  // Step 0
  const [name, setName]     = useState('')
  const [salary, setSalary] = useState('')

  // Step 1
  const [goalTitle, setGoalTitle]   = useState('')
  const [goalAmount, setGoalAmount] = useState('')
  const [goalYear, setGoalYear]     = useState(new Date().getFullYear() + 5)
  const [goalEmoji, setGoalEmoji]   = useState('🎯')

  // Step 2
  const [needs, setNeeds]     = useState(50)
  const [wants, setWants]     = useState(30)
  const [savings, setSavings] = useState(20)

  async function handleStep0() {
    if (!name.trim() || !salary) return
    await window.electronAPI.saveProfile({ name: name.trim(), monthly_salary: parseFloat(salary) || 0 })
    setStep(1)
  }

  async function handleStep1(save) {
    if (save && goalTitle.trim() && goalAmount) {
      await window.electronAPI.createGoal({
        title: goalTitle.trim(),
        type: 'need',
        target_amount: parseFloat(goalAmount),
        target_year: Number(goalYear),
        emoji: goalEmoji,
        color: '#6C63FF',
        inflation_rate: 6,
      })
    }
    setStep(2)
  }

  async function handleStep2(save) {
    if (save) {
      const sal = parseFloat(salary) || 0
      const today = new Date().toISOString().slice(0, 10)
      await window.electronAPI.createPlan({
        label: 'Initial Plan',
        monthly_salary: sal,
        effective_from: today,
        items: [
          { name: 'Needs',      amount: Math.round((needs   / 100) * sal), category: 'needs',      sort_order: 0 },
          { name: 'Wants',      amount: Math.round((wants   / 100) * sal), category: 'wants',      sort_order: 1 },
          { name: 'Investment', amount: Math.round((savings / 100) * sal), category: 'investment', sort_order: 2 },
        ],
      })
    }
    onComplete()
  }

  const total = needs + wants + savings

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: '#1a1a2e' }}>
      <div className="w-[520px] max-h-[90vh] overflow-y-auto">

        {/* Logo */}
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold" style={{ backgroundColor: '#6C63FF' }}>WL</div>
          <span className="text-white font-bold text-xl tracking-tight">WealthLens</span>
        </div>

        {/* Progress steps */}
        <div className="flex items-center px-4 mb-8">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center flex-1 last:flex-none">
              <div className="flex items-center gap-2 shrink-0">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors"
                  style={{
                    backgroundColor: i < step ? '#22C55E' : i === step ? '#6C63FF' : 'rgba(255,255,255,0.1)',
                    color: i <= step ? '#fff' : 'rgba(255,255,255,0.4)',
                  }}
                >
                  {i < step ? '✓' : i + 1}
                </div>
                <span className="text-xs font-medium" style={{ color: i === step ? '#fff' : 'rgba(255,255,255,0.35)' }}>{s}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className="flex-1 mx-3 h-px" style={{ backgroundColor: i < step ? '#22C55E' : 'rgba(255,255,255,0.1)' }} />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl p-8 shadow-2xl mx-4">
          {/* ── Step 0: Profile ── */}
          {step === 0 && (
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Welcome to WealthLens 👋</h2>
              <p className="text-sm text-gray-500 mb-6">Let's set up your profile to get started.</p>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Your Name *</label>
                  <input
                    autoFocus
                    type="text" placeholder="e.g. Rahul Sharma"
                    value={name} onChange={e => setName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleStep0()}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base font-medium text-gray-900 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Monthly Take-Home Salary (₹) *</label>
                  <input
                    type="number" min="0" step="1000" placeholder="e.g. 80000"
                    value={salary} onChange={e => setSalary(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleStep0()}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base font-medium text-gray-900 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                  />
                </div>
              </div>

              <button
                onClick={handleStep0}
                disabled={!name.trim() || !salary}
                className="w-full py-3 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
                style={{ backgroundColor: '#6C63FF' }}
              >
                Continue →
              </button>
            </>
          )}

          {/* ── Step 1: Goal ── */}
          {step === 1 && (
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Your First Goal 🎯</h2>
              <p className="text-sm text-gray-500 mb-6">What are you saving for? You can add more goals later.</p>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Goal Title</label>
                  <input
                    type="text" placeholder="e.g. Emergency Fund, New Car, Home Loan"
                    value={goalTitle} onChange={e => setGoalTitle(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-900 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Pick an Emoji</label>
                  <div className="flex gap-2 flex-wrap">
                    {GOAL_EMOJIS.map(e => (
                      <button
                        key={e}
                        onClick={() => setGoalEmoji(e)}
                        className="w-10 h-10 rounded-xl text-xl transition-colors"
                        style={goalEmoji === e ? { backgroundColor: '#6C63FF20', outline: '2px solid #6C63FF' } : { backgroundColor: '#F9FAFB' }}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Target Amount (₹)</label>
                    <input
                      type="number" min="0" placeholder="e.g. 500000"
                      value={goalAmount} onChange={e => setGoalAmount(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-900 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Target Year</label>
                    <input
                      type="number"
                      min={new Date().getFullYear()} max={new Date().getFullYear() + 40}
                      value={goalYear} onChange={e => setGoalYear(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-900 focus:outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/20"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => handleStep1(false)} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                  Skip for now
                </button>
                <button
                  onClick={() => handleStep1(true)}
                  disabled={!goalTitle.trim() || !goalAmount}
                  className="flex-1 py-3 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
                  style={{ backgroundColor: '#6C63FF' }}
                >
                  Add Goal →
                </button>
              </div>
            </>
          )}

          {/* ── Step 2: Salary split ── */}
          {step === 2 && (
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Salary Split 📊</h2>
              <p className="text-sm text-gray-500 mb-1">Use the 50/30/20 rule to allocate your income.</p>
              <p className={`text-xs font-semibold mb-6 ${total === 100 ? 'text-green-600' : 'text-red-500'}`}>
                Total: {total}% {total === 100 ? '✓ perfect' : '— must equal 100%'}
              </p>

              {[
                { label: 'Needs 🏠', val: needs, set: setNeeds, color: '#3B82F6', desc: 'Rent, food, utilities, EMIs' },
                { label: 'Wants 🎭', val: wants, set: setWants, color: '#8B5CF6', desc: 'Entertainment, dining out, shopping' },
                { label: 'Savings & Investments 📈', val: savings, set: setSavings, color: '#10B981', desc: 'MF, stocks, FD, emergency fund' },
              ].map(item => (
                <div key={item.label} className="mb-5">
                  <div className="flex items-start justify-between mb-1.5">
                    <div>
                      <span className="text-sm font-semibold text-gray-800">{item.label}</span>
                      <p className="text-xs text-gray-400">{item.desc}</p>
                    </div>
                    <span className="text-sm font-bold ml-2" style={{ color: item.color }}>{item.val}%</span>
                  </div>
                  <input
                    type="range" min="0" max="100" value={item.val}
                    onChange={e => item.set(Number(e.target.value))}
                    style={{ accentColor: item.color }}
                    className="w-full h-1.5 rounded-full"
                  />
                </div>
              ))}

              <div className="flex gap-3">
                <button onClick={() => handleStep2(false)} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                  Skip for now
                </button>
                <button
                  onClick={() => handleStep2(true)}
                  disabled={total !== 100}
                  className="flex-1 py-3 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
                  style={{ backgroundColor: '#6C63FF' }}
                >
                  Get Started 🚀
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
