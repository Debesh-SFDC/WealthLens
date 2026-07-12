import { useState, useEffect, useCallback, useMemo } from 'react'

function fmtCr(v) {
  const n = v || 0
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)}L`
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(0)}K`
  return `${sign}₹${Math.round(abs)}`
}

// ── Date helpers ────────────────────────────────────────────────────────────
function parseDate(d) {
  if (!d) return null
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? null : dt
}

function daysRemaining(targetDate) {
  const t = parseDate(targetDate)
  if (!t) return null
  const now = new Date()
  t.setHours(0, 0, 0, 0)
  now.setHours(0, 0, 0, 0)
  return Math.round((t - now) / (24 * 60 * 60 * 1000))
}

function isOverdue(targetDate) {
  const d = daysRemaining(targetDate)
  return d !== null && d < 0
}

function monthsBetween(fromStr, toStr) {
  const from = parseDate(fromStr)
  const to = parseDate(toStr)
  if (!from || !to) return 0
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + (to.getDate() - from.getDate()) / 30
}

function monthsRemaining(targetDate) {
  return monthsBetween(new Date().toISOString(), targetDate)
}

function countdownLabel(targetDate) {
  const days = daysRemaining(targetDate)
  if (days === null) return 'No deadline set'
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} overdue`
  if (days === 0) return 'Due today'
  if (days < 60) return `${days} day${days !== 1 ? 's' : ''} left`
  const months = Math.round(days / 30.44)
  if (months < 24) return `${months} month${months !== 1 ? 's' : ''} left`
  return `${(days / 365.25).toFixed(1)} yr left`
}

function fmtDate(d) {
  const dt = parseDate(d)
  if (!dt) return '—'
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Goal type / palette constants ───────────────────────────────────────────
const TYPE_META = {
  emergency_fund:   { label: 'Emergency Fund',   icon: '🛡️', color: '#3B82F6', desc: 'A safety net for unexpected expenses' },
  opportunity_fund: { label: 'Opportunity Fund', icon: '💼', color: '#8B5CF6', desc: "Cash parked and ready to seize an investment opportunity" },
  life_goal:        { label: 'Life Goal',        icon: '🎯', color: '#F97316', desc: 'Bike, car, vacation, gadget, home down payment & more' },
  debt_payoff:      { label: 'Debt Payoff',      icon: '💳', color: '#EF4444', desc: 'Pay off a loan faster and save on interest' },
  custom:           { label: 'Custom Goal',      icon: '⭐', color: '#F59E0B', desc: "Anything else — savings target, personal milestone, or any goal that doesn't fit above" },
}

const EMOJIS = [
  '🏠','🚗','✈️','🎓','💍','👶','💊','🏋️','📱','💻',
  '🌴','🎯','💰','🏦','📈','🛒','🎁','🏖️','🎸','⚽',
  '🏕️','🛡️','🔑','🏡','🚀','🌿','💎','🌏','💼','💳',
]

const COLORS = [
  '#6C63FF','#3B82F6','#10B981','#F59E0B',
  '#EF4444','#8B5CF6','#EC4899','#14B8A6',
  '#F97316','#6366F1','#84CC16','#06B6D4',
]

const BLANK_FORM = {
  type: 'life_goal',
  title: '',
  emoji: TYPE_META.life_goal.icon,
  color: TYPE_META.life_goal.color,
  target_date: '',
  notes: '',
  category: 'need',
  target_amount: '',
  current_amount: '',
  bank_or_provider: '',
  inflation_adjust: false,
  inflation_rate: 6,
  monthly_emi: '',
}

// ── Domain calculations (shared by cards, rows, detail screen, wizard) ─────
function effectiveTarget(goal) {
  if ((goal.type === 'life_goal' || goal.type === 'custom') && goal.inflation_adjust) {
    const years = Math.max(0, monthsRemaining(goal.target_date) / 12)
    return (goal.target_amount || 0) * Math.pow(1 + (goal.inflation_rate || 6) / 100, years)
  }
  return goal.target_amount || 0
}

function progressPct(goal) {
  const target = effectiveTarget(goal)
  if (target <= 0) return 0
  return Math.min(100, Math.max(0, ((goal.current_amount || 0) / target) * 100))
}

function sipNeeded(target, saved, months, annualReturn = 12) {
  if (months <= 0) return Math.max(0, target - saved)
  const r = annualReturn / 100 / 12
  const factor = Math.pow(1 + r, months)
  if (factor <= 1) return Math.max(0, (target - saved) / months)
  return Math.max(0, (target - saved * factor) * r / (factor - 1))
}

function totalLinkedSip(linkedInvestments) {
  return (linkedInvestments || []).filter(i => i.type === 'mf_sip').reduce((s, i) => s + (i.monthly_sip_amount || 0), 0)
}

function monthlyNeeded(goal, linkedInvestments) {
  if (!goal.target_date) return null
  const target = effectiveTarget(goal)
  const remaining = Math.max(0, target - (goal.current_amount || 0))
  const months = monthsRemaining(goal.target_date)
  if (months <= 0) return remaining
  const raw = goal.type === 'life_goal' ? sipNeeded(target, goal.current_amount || 0, months) : remaining / months
  return Math.max(0, raw - totalLinkedSip(linkedInvestments))
}

// Literal spec formula for the "SIPs already contributing" nudge — deliberately linear
// (not the SIP-compounding assumption monthlyNeeded uses for life goals).
function sipContributionNudge(goal, linkedInvestments) {
  if (goal.is_achieved || !goal.target_date) return null
  const target = effectiveTarget(goal)
  const gap = Math.max(0, target - (goal.current_amount || 0))
  const months = monthsRemaining(goal.target_date)
  if (months <= 0) return null
  const rawNeeded = gap / months
  const sip = totalLinkedSip(linkedInvestments)
  if (sip <= 0) return null
  const dateLabel = fmtDate(goal.target_date)
  if (sip >= rawNeeded) {
    return {
      icon: '🎉',
      tone: 'success',
      text: `Your existing SIPs of ${fmtCr(sip)}/mo are enough to hit this goal by ${dateLabel}. No additional investment needed! 🎉`,
    }
  }
  const additional = rawNeeded - sip
  return {
    icon: '💹',
    tone: 'info',
    text: `Your SIPs contribute ${fmtCr(sip)}/mo toward this goal. You need ${fmtCr(additional)}/mo more to hit your target by ${dateLabel}.`,
  }
}

function guessLoanRate(title) {
  const t = (title || '').toLowerCase()
  if (t.includes('home')) return 8.5
  if (t.includes('car') || t.includes('vehicle') || t.includes('auto')) return 9.5
  if (t.includes('credit card') || t.includes('card')) return 36
  if (t.includes('personal')) return 13
  return 11
}

function debtPayoffStats(goal) {
  const outstanding = Math.max(0, (goal.target_amount || 0) - (goal.current_amount || 0))
  const emi = goal.monthly_emi || 0
  const monthsToTarget = Math.max(0, monthsRemaining(goal.target_date))
  const monthsAtCurrentEmi = emi > 0 ? outstanding / emi : Infinity
  const extraMonthly = monthsToTarget > 0 ? Math.max(0, outstanding / monthsToTarget - emi) : outstanding
  const monthsSaved = Number.isFinite(monthsAtCurrentEmi) && monthsToTarget > 0
    ? Math.max(0, monthsAtCurrentEmi - monthsToTarget)
    : 0
  const rate = guessLoanRate(goal.title)
  const interestSaved = monthsSaved * emi * (rate / 100 / 12)
  return { outstanding, emi, monthsToTarget, monthsAtCurrentEmi, extraMonthly, monthsSaved, interestSaved, rate }
}

function computeMonthlyPace(goal, contributions) {
  const list = contributions || []
  if (list.length === 0) {
    const months = Math.max(1, monthsBetween(goal.created_at, new Date().toISOString()))
    return (goal.current_amount || 0) / months
  }
  const total = list.reduce((s, c) => s + c.amount, 0)
  const oldest = list.reduce((min, c) => (c.contributed_at < min ? c.contributed_at : min), list[0].contributed_at)
  const months = Math.max(1, monthsBetween(oldest, new Date().toISOString()))
  return total / months
}

function nudgesFor(goal, contributions) {
  const nudges = []
  if (goal.is_achieved) return nudges

  const target = effectiveTarget(goal)
  const pct = progressPct(goal)
  const days = daysRemaining(goal.target_date)

  if (pct >= 100) {
    nudges.push({ icon: '✅', text: 'Goal achieved! Mark it complete and celebrate 🎉', tone: 'success' })
    return nudges
  }

  if (days !== null && days >= 0 && days < 30) {
    nudges.push({ icon: '⏰', text: 'Less than 30 days to target date — final push needed!', tone: 'warning' })
  }

  const remaining = Math.max(0, target - (goal.current_amount || 0))
  const monthsLeft = monthsRemaining(goal.target_date)
  const pace = computeMonthlyPace(goal, contributions)

  if (monthsLeft > 0 && pace > 0) {
    const projectedMonths = remaining / pace
    const diff = projectedMonths - monthsLeft
    if (diff > 0.5) {
      const monthsOver = Math.round(diff)
      const neededPace = remaining / monthsLeft
      const shortfall = Math.max(0, neededPace - pace)
      nudges.push({
        icon: '⚠️',
        text: `At your current pace you'll miss this goal by ${monthsOver} month${monthsOver !== 1 ? 's' : ''} — increase monthly contribution by ${fmtCr(shortfall)} to stay on track`,
        tone: 'danger',
      })
    } else if (diff < -0.5) {
      const monthsEarly = Math.round(-diff)
      nudges.push({
        icon: '🎉',
        text: `You're ahead of schedule! You'll hit this goal ${monthsEarly} month${monthsEarly !== 1 ? 's' : ''} early at current pace`,
        tone: 'success',
      })
    }
  }

  return nudges
}

function typeBadgeStyle(goal, accent) {
  if (goal.type === 'custom') return { backgroundColor: '#f3f4f6', color: '#6b7280' }
  return { backgroundColor: accent + '15', color: accent }
}

// ── Icons ────────────────────────────────────────────────────────────────
const EditIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
)
const TrashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6m4-6v6"/><path d="M9 6V4h6v2"/>
  </svg>
)
const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)
const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)
const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)
const GridIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
  </svg>
)
const ListIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
    <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
  </svg>
)

function RingProgress({ pct, color, size = 72, stroke = 6 }) {
  const r = (size - stroke * 2) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.min(pct / 100, 1))
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${circ} ${circ}`} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.7s ease' }} />
    </svg>
  )
}

function ToggleSwitch({ on, onClick, accent }) {
  return (
    <button onClick={onClick} type="button"
      style={{ width: 40, height: 22, borderRadius: 999, position: 'relative', backgroundColor: on ? accent : '#d1d5db', transition: 'background-color .2s', flexShrink: 0 }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
    </button>
  )
}

function InflationAdjustFields({ form, set, accent }) {
  return (
    <>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Adjust for Inflation</label>
        <ToggleSwitch on={form.inflation_adjust} accent={accent} onClick={() => set('inflation_adjust', !form.inflation_adjust)} />
      </div>
      <p className="text-xs text-gray-400 mb-3">Future cost = today's cost × (1 + rate)^years to target</p>
      {form.inflation_adjust && (
        <>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">Inflation Rate</span>
            <span className="text-sm font-bold" style={{ color: accent }}>{form.inflation_rate}%</span>
          </div>
          <input type="range" min={1} max={15} step={0.5} value={form.inflation_rate}
            onChange={e => set('inflation_rate', parseFloat(e.target.value))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer bg-gray-200" style={{ accentColor: accent }} />
        </>
      )}
    </>
  )
}

// ── Summary bar ─────────────────────────────────────────────────────────────
function SummaryBar({ activeCount, achievedCount, totalTarget, totalSaved, overallPct }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
      <div className="flex items-center gap-6 flex-wrap">
        <div className="relative shrink-0">
          <RingProgress pct={overallPct} color="#6C63FF" size={64} stroke={7} />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-bold text-gray-900">{Math.round(overallPct)}%</span>
          </div>
        </div>
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4 min-w-[280px]">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Goals</p>
            <p className="text-lg font-bold text-gray-900">{activeCount} active</p>
            <p className="text-xs text-gray-400">{achievedCount} achieved</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Total Target</p>
            <p className="text-lg font-bold text-gray-900">{fmtCr(totalTarget)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Total Saved</p>
            <p className="text-lg font-bold text-green-600">{fmtCr(totalSaved)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Remaining</p>
            <p className="text-lg font-bold text-gray-700">{fmtCr(Math.max(0, totalTarget - totalSaved))}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Card grid view ───────────────────────────────────────────────────────────
function LinkedInvestmentChips({ linkedInvestments, className = 'mb-3' }) {
  if (!linkedInvestments || linkedInvestments.length === 0) return null
  const visible = linkedInvestments.slice(0, 2)
  const extra = linkedInvestments.length - visible.length
  return (
    <div className={`flex items-center gap-1 flex-wrap ${className}`}>
      {visible.map(inv => (
        <span key={inv.id} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600 truncate max-w-[120px]">
          {inv.name}
        </span>
      ))}
      {extra > 0 && (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500">+{extra} more</span>
      )}
    </div>
  )
}

function GoalCardGrid({ goal, linkedInvestments, onView, onEdit, onDelete, onContribute }) {
  const meta = TYPE_META[goal.type] || TYPE_META.life_goal
  const accent = goal.color || meta.color
  const target = effectiveTarget(goal)
  const pct = progressPct(goal)
  const isDebt = goal.type === 'debt_payoff'
  const needed = monthlyNeeded(goal, linkedInvestments)
  const achieved = Boolean(goal.is_achieved)
  const outstanding = isDebt ? Math.max(0, (goal.target_amount || 0) - (goal.current_amount || 0)) : null
  const ringColor = achieved ? '#10B981' : accent

  return (
    <div
      className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group overflow-hidden"
      onClick={() => onView(goal)}
    >
      <div className="h-1" style={{ backgroundColor: ringColor }} />
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 select-none" style={{ backgroundColor: ringColor + '18' }}>
              {goal.emoji || meta.icon}
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-900 leading-tight text-sm truncate">{goal.title}</h3>
              <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={typeBadgeStyle(goal, accent)}>
                {meta.label}
              </span>
            </div>
          </div>
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={e => e.stopPropagation()}>
            <button onClick={() => onContribute(goal)} title="Add contribution" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"><PlusIcon /></button>
            <button onClick={() => onEdit(goal)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"><EditIcon /></button>
            <button onClick={() => onDelete(goal.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"><TrashIcon /></button>
          </div>
        </div>

        {goal.bank_or_provider && <p className="text-xs text-gray-400 mb-1.5 truncate">📍 {goal.bank_or_provider}</p>}
        <LinkedInvestmentChips linkedInvestments={linkedInvestments} />

        {achieved && (
          <div className="px-2.5 py-1.5 rounded-lg bg-green-50 mb-3 text-center">
            <span className="text-xs font-semibold text-green-700">✅ Achieved</span>
          </div>
        )}

        <div className="flex items-center gap-4 mb-4">
          <div className="relative shrink-0">
            <RingProgress pct={achieved ? 100 : pct} color={ringColor} size={72} stroke={7} />
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-sm font-bold leading-none" style={{ color: ringColor }}>{Math.round(achieved ? 100 : pct)}%</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            {isDebt ? (
              <>
                <p className="text-lg font-bold text-gray-900 leading-tight">{fmtCr(outstanding)}</p>
                <p className="text-xs text-gray-400">left of {fmtCr(goal.target_amount)}</p>
              </>
            ) : (
              <>
                <p className="text-lg font-bold text-gray-900 leading-tight">{fmtCr(goal.current_amount || 0)}</p>
                <p className="text-xs text-gray-400">
                  of {fmtCr(target)} · {(linkedInvestments || []).length > 0 ? 'Auto' : 'Manual'}
                </p>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-gray-50">
          <span className={`text-xs font-medium ${isOverdue(goal.target_date) ? 'text-red-500' : 'text-gray-400'}`}>
            {countdownLabel(goal.target_date)}
          </span>
          {!achieved && needed > 0 && (
            <span className="px-2 py-1 rounded-lg text-xs font-bold" style={{ backgroundColor: accent + '12', color: accent }}>
              {fmtCr(needed)}/mo needed
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── List view row ─────────────────────────────────────────────────────────
function GoalListRow({ goal, linkedInvestments, onView, onEdit, onDelete, onContribute }) {
  const meta = TYPE_META[goal.type] || TYPE_META.life_goal
  const accent = goal.color || meta.color
  const target = effectiveTarget(goal)
  const pct = progressPct(goal)
  const isDebt = goal.type === 'debt_payoff'
  const needed = monthlyNeeded(goal, linkedInvestments)
  const achieved = Boolean(goal.is_achieved)
  const outstanding = isDebt ? Math.max(0, (goal.target_amount || 0) - (goal.current_amount || 0)) : null
  const ringColor = achieved ? '#10B981' : accent

  return (
    <div
      className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group cursor-pointer p-4 flex items-center gap-4"
      onClick={() => onView(goal)}
    >
      <div className="flex items-center gap-3 w-56 shrink-0 min-w-0">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 select-none" style={{ backgroundColor: ringColor + '18' }}>
          {goal.emoji || meta.icon}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{goal.title}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold shrink-0" style={typeBadgeStyle(goal, accent)}>{meta.label}</span>
            {goal.bank_or_provider && <span className="text-[11px] text-gray-400 truncate">{goal.bank_or_provider}</span>}
          </div>
          <LinkedInvestmentChips linkedInvestments={linkedInvestments} className="mt-1" />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1.5 gap-2">
          <span className="text-xs text-gray-500 truncate">
            {isDebt ? `${fmtCr(outstanding)} left of ${fmtCr(goal.target_amount)}` : `${fmtCr(goal.current_amount || 0)} of ${fmtCr(target)}`}
          </span>
          <span className="text-xs font-bold shrink-0" style={{ color: ringColor }}>{Math.round(achieved ? 100 : pct)}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${achieved ? 100 : pct}%`, backgroundColor: ringColor }} />
        </div>
      </div>

      <div className="w-36 shrink-0 text-right">
        {achieved ? (
          <span className="text-xs font-semibold text-green-600">✅ Achieved</span>
        ) : (
          <>
            <p className={`text-xs font-medium ${isOverdue(goal.target_date) ? 'text-red-500' : 'text-gray-500'}`}>{countdownLabel(goal.target_date)}</p>
            {needed > 0 && <p className="text-xs font-bold mt-0.5" style={{ color: accent }}>{fmtCr(needed)}/mo</p>}
          </>
        )}
      </div>

      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={e => e.stopPropagation()}>
        <button onClick={() => onContribute(goal)} title="Add contribution" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"><PlusIcon /></button>
        <button onClick={() => onEdit(goal)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"><EditIcon /></button>
        <button onClick={() => onDelete(goal.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"><TrashIcon /></button>
      </div>
    </div>
  )
}

// ── Add / Edit wizard ────────────────────────────────────────────────────────
const STEP_LABELS = ['Type', 'Details', 'Review']

function GoalFormWizard({ initial, investments, onSave, onClose }) {
  const [step, setStep] = useState(initial ? 2 : 1)
  const [form, setForm] = useState(() => initial ? {
    type: initial.type,
    title: initial.title || '',
    emoji: initial.emoji || TYPE_META[initial.type]?.icon || '🎯',
    color: initial.color || TYPE_META[initial.type]?.color || '#6C63FF',
    target_date: initial.target_date || '',
    notes: initial.notes || '',
    category: initial.category || 'need',
    target_amount: initial.target_amount ?? '',
    current_amount: initial.current_amount ?? '',
    bank_or_provider: initial.bank_or_provider || '',
    inflation_adjust: Boolean(initial.inflation_adjust),
    inflation_rate: initial.inflation_rate ?? 6,
    monthly_emi: initial.monthly_emi ?? '',
  } : BLANK_FORM)
  const [showEmoji, setShowEmoji] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [saving, setSaving] = useState(false)
  const [linkedIds, setLinkedIds] = useState([])
  const [showPicker, setShowPicker] = useState(false)

  useEffect(() => {
    if (initial?.id) {
      window.electronAPI.getGoalInvestments(initial.id)
        .then(rows => setLinkedIds((rows || []).map(r => r.id)))
        .catch(() => {})
    }
  }, [initial?.id])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const toggleLink = (id) => setLinkedIds(ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]))
  const meta = TYPE_META[form.type] || TYPE_META.life_goal
  const accent = form.color || meta.color
  const isDebt = form.type === 'debt_payoff'
  const isLife = form.type === 'life_goal'
  const isCustom = form.type === 'custom'
  const bankRequired = form.type === 'emergency_fund' || form.type === 'opportunity_fund' || isDebt
  const dateRequired = !isCustom
  const linkedInvestmentObjs = isDebt ? [] : linkedIds.map(id => investments.find(i => i.id === id)).filter(Boolean)

  const previewGoal = {
    type: form.type,
    title: form.title,
    target_amount: Number(form.target_amount) || 0,
    current_amount: isDebt ? (initial?.current_amount || 0) : Number(form.current_amount) || 0,
    target_date: form.target_date,
    inflation_adjust: (isLife || isCustom) && form.inflation_adjust,
    inflation_rate: Number(form.inflation_rate) || 6,
    monthly_emi: isDebt ? Number(form.monthly_emi) || 0 : 0,
    created_at: initial?.created_at || new Date().toISOString(),
  }
  const target = effectiveTarget(previewGoal)
  const needed = monthlyNeeded(previewGoal, linkedInvestmentObjs)
  const debtStats = isDebt ? debtPayoffStats(previewGoal) : null

  const canProceedStep2 = Boolean(form.title.trim() && form.target_amount && (!dateRequired || form.target_date) && (!bankRequired || form.bank_or_provider.trim()))

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({
        title: form.title.trim(),
        type: form.type,
        category: form.category,
        target_amount: Number(form.target_amount) || 0,
        current_amount: isDebt ? (initial?.current_amount || 0) : Number(form.current_amount) || 0,
        target_date: form.target_date || null,
        bank_or_provider: form.bank_or_provider.trim() || null,
        emoji: form.emoji,
        color: form.color,
        inflation_adjust: (isLife || isCustom) && form.inflation_adjust,
        inflation_rate: Number(form.inflation_rate) || 6,
        monthly_emi: isDebt ? Number(form.monthly_emi) || 0 : 0,
        notes: form.notes.trim() || null,
        linkedInvestmentIds: isDebt ? [] : linkedIds,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{initial ? 'Edit Goal' : 'New Goal'}</h2>
            <div className="flex items-center gap-1.5 mt-1.5">
              {STEP_LABELS.map((label, i) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{ backgroundColor: step >= i + 1 ? accent : '#e5e7eb', color: step >= i + 1 ? '#fff' : '#9ca3af' }}>
                    {i + 1}
                  </span>
                  <span className="text-xs font-medium" style={{ color: step === i + 1 ? '#1a1a2e' : '#9ca3af' }}>{label}</span>
                  {i < STEP_LABELS.length - 1 && <span className="w-4 h-px bg-gray-200 mx-1" />}
                </div>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(TYPE_META).filter(([key]) => key !== 'custom').map(([key, m]) => (
                  <button key={key}
                    onClick={() => { set('type', key); set('color', m.color); set('emoji', m.icon); setStep(2) }}
                    className="text-left p-5 rounded-2xl border-2 transition-all hover:shadow-md"
                    style={{ borderColor: form.type === key ? m.color : '#e5e7eb', backgroundColor: form.type === key ? m.color + '0c' : '#fff' }}>
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl mb-3" style={{ backgroundColor: m.color + '18' }}>{m.icon}</div>
                    <p className="font-bold text-gray-900 text-sm mb-1">{m.label}</p>
                    <p className="text-xs text-gray-500 leading-snug">{m.desc}</p>
                  </button>
                ))}
              </div>
              <button
                onClick={() => { set('type', 'custom'); set('color', TYPE_META.custom.color); set('emoji', TYPE_META.custom.icon); setStep(2) }}
                className="w-full text-left p-5 rounded-2xl border-2 transition-all hover:shadow-md flex items-center gap-4"
                style={{ borderColor: form.type === 'custom' ? TYPE_META.custom.color : '#e5e7eb', backgroundColor: form.type === 'custom' ? TYPE_META.custom.color + '0c' : '#fff' }}>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ backgroundColor: TYPE_META.custom.color + '18' }}>{TYPE_META.custom.icon}</div>
                <div>
                  <p className="font-bold text-gray-900 text-sm mb-1">{TYPE_META.custom.label}</p>
                  <p className="text-xs text-gray-500 leading-snug">{TYPE_META.custom.desc}</p>
                </div>
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="flex gap-3 items-start">
                <div className="relative shrink-0">
                  <button onClick={() => setShowEmoji(v => !v)}
                    className="w-14 h-14 rounded-xl border-2 text-2xl flex items-center justify-center transition-colors hover:border-gray-300"
                    style={{ borderColor: showEmoji ? accent : '#e5e7eb' }}>
                    {form.emoji}
                  </button>
                  {showEmoji && (
                    <div className="absolute top-16 left-0 z-20 bg-white rounded-xl shadow-2xl border border-gray-100 p-3 grid grid-cols-6 gap-1 w-52">
                      {EMOJIS.map(e => (
                        <button key={e} onClick={() => { set('emoji', e); setShowEmoji(false) }}
                          className="w-7 h-7 text-lg hover:bg-gray-100 rounded-lg flex items-center justify-center">
                          {e}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    {isDebt ? 'Loan Name' : 'Goal Title'}
                  </label>
                  <input
                    autoFocus
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 transition-shadow"
                    placeholder={isDebt ? 'e.g. Home Loan' : 'e.g. Dream Vacation'}
                    value={form.title}
                    onChange={e => set('title', e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Need or Want</label>
                <div className="flex rounded-xl border border-gray-200 overflow-hidden w-fit">
                  {['need', 'want'].map(c => (
                    <button key={c} onClick={() => set('category', c)}
                      className="px-5 py-2 text-sm font-semibold transition-colors"
                      style={{ backgroundColor: form.category === c ? accent : 'transparent', color: form.category === c ? '#fff' : '#6b7280' }}>
                      {c === 'need' ? 'Need' : 'Want'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    {isDebt ? 'Total Outstanding (₹)' : isLife ? "Today's Cost (₹)" : 'Target Amount (₹)'}
                  </label>
                  <input type="number" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2"
                    placeholder="e.g. 300000" value={form.target_amount} onChange={e => set('target_amount', e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    {isDebt ? 'Target Payoff Date' : 'Target Date'} {isCustom && <span className="font-normal normal-case text-gray-400">optional</span>}
                  </label>
                  <input type="date" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2"
                    value={form.target_date} onChange={e => set('target_date', e.target.value)} />
                  {isCustom && !form.target_date && (
                    <p className="text-xs text-gray-400 mt-1">No date → open-ended goal, tracked by progress % only</p>
                  )}
                </div>
              </div>

              {!isDebt && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Already Saved (₹) <span className="font-normal normal-case text-gray-400">optional</span>
                  </label>
                  <input type="number" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2"
                    placeholder="0" value={form.current_amount} onChange={e => set('current_amount', e.target.value)} />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    {isDebt ? 'Lender' : 'Bank / Instrument'} {bankRequired && <span className="text-red-400">*</span>}
                  </label>
                  <input className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2"
                    placeholder={isDebt ? 'e.g. HDFC Bank' : 'e.g. SBI Savings'} value={form.bank_or_provider} onChange={e => set('bank_or_provider', e.target.value)} />
                </div>
                {isDebt && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Current Monthly EMI (₹)</label>
                    <input type="number" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2"
                      placeholder="e.g. 25000" value={form.monthly_emi} onChange={e => set('monthly_emi', e.target.value)} />
                  </div>
                )}
              </div>

              {!isDebt && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Linked Investments</label>
                    {investments.length > 0 && (
                      <button type="button" onClick={() => setShowPicker(true)} className="text-xs font-semibold" style={{ color: accent }}>
                        + Link Investment
                      </button>
                    )}
                  </div>
                  {linkedIds.length === 0 ? (
                    <p className="text-xs text-gray-400">
                      {investments.length > 0 ? 'No investments linked — progress will be tracked manually.' : 'No investments to link yet.'}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {linkedInvestmentObjs.map(inv => (
                        <span key={inv.id} className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                          {inv.name}
                          <button type="button" onClick={() => toggleLink(inv.id)} className="w-4 h-4 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors leading-none">
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {isLife && (
                <div className="rounded-xl border border-gray-200 p-4">
                  <InflationAdjustFields form={form} set={set} accent={accent} />
                </div>
              )}

              {isCustom && (
                <div>
                  <button type="button" onClick={() => setShowAdvanced(v => !v)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors">
                    <span>{showAdvanced ? '▾' : '▸'}</span> Advanced options
                  </button>
                  {showAdvanced && (
                    <div className="rounded-xl border border-gray-200 p-4 mt-2">
                      <InflationAdjustFields form={form} set={set} accent={accent} />
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Color</label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map(c => (
                    <button key={c} onClick={() => set('color', c)}
                      className="w-7 h-7 rounded-full transition-transform hover:scale-110 shrink-0 border-2"
                      style={{ backgroundColor: c, borderColor: form.color === c ? c : 'transparent', outline: form.color === c ? `2px solid ${c}` : 'none', outlineOffset: 2 }} />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  {form.type === 'opportunity_fund' ? 'Purpose of this Opportunity' : 'Notes'} <span className="font-normal normal-case text-gray-400">optional</span>
                </label>
                <textarea rows={2} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 resize-none"
                  placeholder={form.type === 'opportunity_fund' ? 'e.g. Waiting for a market dip to deploy' : 'Optional notes…'}
                  value={form.notes} onChange={e => set('notes', e.target.value)} />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-2xl p-5" style={{ backgroundColor: accent + '0c' }}>
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-3xl">{form.emoji}</span>
                  <div>
                    <p className="font-bold text-gray-900">{form.title || 'Your Goal'}</p>
                    <p className="text-xs text-gray-500">{meta.label} · {form.category === 'need' ? 'Need' : 'Want'}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white rounded-xl p-3.5 shadow-sm">
                    <p className="text-xs text-gray-400 mb-0.5">
                      {isDebt ? 'Total Outstanding' : (isLife || isCustom) && form.inflation_adjust ? 'Inflation-Adjusted Target' : 'Target'}
                    </p>
                    <p className="text-lg font-bold" style={{ color: accent }}>{fmtCr(target)}</p>
                    {(isLife || isCustom) && form.inflation_adjust && <p className="text-xs text-gray-400">today's cost {fmtCr(Number(form.target_amount) || 0)}</p>}
                  </div>
                  <div className="bg-white rounded-xl p-3.5 shadow-sm">
                    <p className="text-xs text-gray-400 mb-0.5">Target Date</p>
                    <p className="text-lg font-bold text-gray-800">{fmtDate(form.target_date)}</p>
                    <p className="text-xs text-gray-400">{countdownLabel(form.target_date)}</p>
                  </div>
                  <div className="bg-white rounded-xl p-3.5 shadow-sm col-span-2">
                    {needed === null ? (
                      <>
                        <p className="text-xs text-gray-400 mb-0.5">Timeline</p>
                        <p className="text-2xl font-bold text-gray-700">Open-ended goal</p>
                        <p className="text-xs text-gray-400">No target date — we'll just track progress %</p>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-gray-400 mb-0.5">
                          {isLife ? 'Monthly SIP Needed' : isDebt ? 'Extra Monthly Payment Needed' : 'Monthly Needed'}
                        </p>
                        <p className="text-2xl font-bold text-gray-900">{fmtCr(isDebt ? debtStats.extraMonthly : needed)}</p>
                        <p className="text-xs text-gray-400">
                          {isLife ? 'at 12% expected return' : isDebt ? `over current EMI of ${fmtCr(debtStats.emi)}` : 'to reach target on time'}
                        </p>
                      </>
                    )}
                  </div>
                  {isDebt && debtStats.interestSaved > 0 && (
                    <div className="bg-white rounded-xl p-3.5 shadow-sm col-span-2">
                      <p className="text-xs text-gray-400 mb-0.5">Estimated Interest Saved</p>
                      <p className="text-lg font-bold text-green-600">{fmtCr(debtStats.interestSaved)}</p>
                      <p className="text-xs text-gray-400">by paying off ~{Math.round(debtStats.monthsSaved)} months early (approx., at ~{debtStats.rate}% p.a.)</p>
                    </div>
                  )}
                </div>
              </div>
              {form.bank_or_provider && (
                <p className="text-sm text-gray-500">📍 Sitting in <span className="font-semibold text-gray-700">{form.bank_or_provider}</span></p>
              )}
              {linkedInvestmentObjs.length > 0 && (
                <p className="text-sm text-gray-500">
                  🔗 Linked to <span className="font-semibold text-gray-700">{linkedInvestmentObjs.map(i => i.name).join(', ')}</span> for auto-pull
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 shrink-0">
          <button onClick={() => (step === 1 ? onClose() : setStep(s => s - 1))}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors">
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          {step < 3 ? (
            <button onClick={() => setStep(s => s + 1)} disabled={step === 2 && !canProceedStep2}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: accent }}>
              Next
            </button>
          ) : (
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-50"
              style={{ backgroundColor: accent }}>
              {saving ? 'Saving…' : initial ? 'Save Changes' : 'Create Goal'}
            </button>
          )}
        </div>
      </div>

      {showPicker && (
        <InvestmentPickerModal
          investments={investments}
          selectedIds={linkedIds}
          onToggle={toggleLink}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}

// ── Multi-select investment picker (grouped by type, with search) ────────────
function InvestmentPickerModal({ investments, selectedIds, onToggle, onClose }) {
  const [search, setSearch] = useState('')
  const filtered = investments.filter(i => i.name.toLowerCase().includes(search.trim().toLowerCase()))

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h3 className="font-bold text-gray-900">Link Investments</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><CloseIcon /></button>
        </div>
        <div className="p-4 border-b border-gray-100 shrink-0">
          <input
            autoFocus
            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2"
            placeholder="Search investments…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {investments.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No investments yet — add some on the Investments page first.</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No investments match "{search}".</p>
          ) : (
            INVESTMENT_GROUPS.map(group => {
              const items = filtered.filter(i => group.types.includes(i.type))
              if (items.length === 0) return null
              return (
                <div key={group.key}>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">{group.icon} {group.label}</p>
                  <div className="space-y-1">
                    {items.map(inv => (
                      <label key={inv.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" checked={selectedIds.includes(inv.id)} onChange={() => onToggle(inv.id)} className="w-4 h-4 rounded shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{inv.name}</p>
                          <p className="text-xs text-gray-400">
                            {inv.type === 'mf_sip' && inv.monthly_sip_amount > 0 && `${fmtCr(inv.monthly_sip_amount)}/mo SIP — `}
                            {group.key === 'fd' ? 'Maturity' : 'Current'}: {fmtCr(inv.current_value)}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </div>
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 shrink-0">
          <span className="text-xs text-gray-400">{selectedIds.length} selected</span>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: '#6C63FF' }}>Done</button>
        </div>
      </div>
    </div>
  )
}

// ── Add contribution / update balance modal ─────────────────────────────────
function AddContributionModal({ goal, onSave, onClose }) {
  const isDebt = goal.type === 'debt_payoff'
  const outstanding = Math.max(0, (goal.target_amount || 0) - (goal.current_amount || 0))
  const [amount, setAmount] = useState('')
  const [newOutstanding, setNewOutstanding] = useState(outstanding ? String(Math.round(outstanding)) : '')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const meta = TYPE_META[goal.type] || TYPE_META.life_goal
  const accent = goal.color || meta.color

  const handleSave = async () => {
    setSaving(true)
    try {
      if (isDebt) {
        const updated = Number(newOutstanding) || 0
        const delta = outstanding - updated
        await onSave({
          goal_id: goal.id,
          amount: delta,
          note: note.trim() || `Balance updated to ${fmtCr(updated)}`,
          contributed_at: date,
          contribution_type: 'manual',
        })
      } else {
        await onSave({
          goal_id: goal.id,
          amount: Number(amount) || 0,
          note: note.trim() || null,
          contributed_at: date,
          contribution_type: 'manual',
        })
      }
    } finally {
      setSaving(false)
    }
  }

  const disabled = isDebt ? newOutstanding === '' : !amount || Number(amount) === 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">{isDebt ? 'Update Outstanding Balance' : 'Add Contribution'}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><CloseIcon /></button>
        </div>
        <div className="p-5 space-y-4">
          {isDebt ? (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">New Outstanding Balance (₹)</label>
              <input type="number" autoFocus className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2"
                value={newOutstanding} onChange={e => setNewOutstanding(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">Currently {fmtCr(outstanding)} outstanding</p>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Amount (₹)</label>
              <input type="number" autoFocus className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2"
                placeholder="e.g. 5000" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Date</label>
            <input type="date" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2"
              value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Note <span className="font-normal normal-case text-gray-400">optional</span>
            </label>
            <input className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2"
              placeholder="e.g. Diwali bonus" value={note} onChange={e => setNote(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving || disabled}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-opacity" style={{ backgroundColor: accent }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Goal detail screen ───────────────────────────────────────────────────────
const NUDGE_STYLE = {
  success: { bg: '#ecfdf5', border: '#a7f3d0', text: '#047857' },
  warning: { bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
  danger:  { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c' },
  info:    { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },
}

const INV_TYPE_LABELS = {
  mf_sip: 'SIP', mf_lumpsum: 'Mutual Fund', stocks: 'Stocks', fd: 'FD', rd: 'RD',
  epf: 'EPF', ppf: 'PPF', nps: 'NPS', gold: 'Gold', insurance: 'Insurance',
}

const INVESTMENT_GROUPS = [
  { key: 'sip',    label: 'SIP / Mutual Fund',            icon: '💹', types: ['mf_sip', 'mf_lumpsum'] },
  { key: 'stocks', label: 'Stocks',                        icon: '📈', types: ['stocks'] },
  { key: 'fd',     label: 'FD / Debt',                     icon: '🏦', types: ['fd', 'rd'] },
  { key: 'others', label: 'Others (PPF, NPS, Gold etc.)',  icon: '🪙', types: ['epf', 'ppf', 'nps', 'gold', 'insurance'] },
]

function fmtDateTime(d) {
  const dt = parseDate(d)
  if (!dt) return '—'
  return dt.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function GoalDetailScreen({ goal, linkedInvestments, contributions, syncing, onBack, onEdit, onAchieve, onAddContribution, onSyncAll }) {
  const meta = TYPE_META[goal.type] || TYPE_META.life_goal
  const accent = goal.color || meta.color
  const target = effectiveTarget(goal)
  const pct = progressPct(goal)
  const needed = monthlyNeeded(goal, linkedInvestments)
  const isDebt = goal.type === 'debt_payoff'
  const isLife = goal.type === 'life_goal'
  const debtStats = isDebt ? debtPayoffStats(goal) : null
  const totalSip = totalLinkedSip(linkedInvestments)
  const sipNudge = sipContributionNudge(goal, linkedInvestments)
  const nudges = nudgesFor(goal, contributions)
  const outstanding = isDebt ? Math.max(0, (goal.target_amount || 0) - (goal.current_amount || 0)) : null
  const achieved = Boolean(goal.is_achieved)
  const ringColor = achieved ? '#10B981' : accent

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-5">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">
          <BackIcon /> Back to Goals
        </button>
        <div className="flex gap-2">
          <button onClick={onEdit} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors">
            Edit Goal
          </button>
          {!achieved && pct >= 95 && (
            <button onClick={onAchieve} className="px-4 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity" style={{ backgroundColor: '#10B981' }}>
              ✓ Mark as Achieved
            </button>
          )}
        </div>
      </div>

      {[...nudges, ...(sipNudge ? [sipNudge] : [])].map((n, i) => {
        const s = NUDGE_STYLE[n.tone] || NUDGE_STYLE.warning
        return (
          <div key={i} className="flex items-start gap-2.5 px-4 py-3 rounded-xl mb-3 border" style={{ backgroundColor: s.bg, borderColor: s.border }}>
            <span className="text-base leading-none">{n.icon}</span>
            <p className="text-sm font-medium flex-1" style={{ color: s.text }}>{n.text}</p>
          </div>
        )
      })}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-4 overflow-hidden">
        <div className="h-1.5" style={{ backgroundColor: ringColor }} />
        <div className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shrink-0 select-none" style={{ backgroundColor: ringColor + '18' }}>
              {goal.emoji || meta.icon}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="text-2xl font-bold text-gray-900">{goal.title}</h1>
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={typeBadgeStyle(goal, accent)}>{meta.label}</span>
                {achieved && <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700">✅ Achieved</span>}
              </div>
              <p className="text-sm text-gray-500">
                {goal.bank_or_provider && <>{goal.bank_or_provider} · </>}
                Target: {fmtDate(goal.target_date)} ·{' '}
                <span className={isOverdue(goal.target_date) ? 'text-red-500 font-medium' : 'text-gray-500'}>{countdownLabel(goal.target_date)}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="relative shrink-0">
              <RingProgress pct={achieved ? 100 : pct} color={ringColor} size={96} stroke={9} />
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-lg font-bold leading-none" style={{ color: ringColor }}>{Math.round(achieved ? 100 : pct)}%</span>
                <span className="text-[9px] text-gray-400 mt-0.5 leading-none">{isDebt ? 'paid off' : 'funded'}</span>
              </div>
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-baseline mb-2">
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">{isDebt ? 'Paid Off' : 'Saved'}</p>
                  <p className="text-2xl font-bold text-gray-900">{fmtCr(goal.current_amount || 0)}</p>
                  <p className="text-[10px] font-medium mt-0.5" style={{ color: linkedInvestments.length > 0 ? '#6366F1' : '#9ca3af' }}>
                    {linkedInvestments.length > 0 ? 'Auto-calculated from linked investments' : 'Manual'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400 mb-0.5">{isDebt ? 'Original Outstanding' : 'Target'}</p>
                  <p className="text-2xl font-bold" style={{ color: accent }}>{fmtCr(target)}</p>
                </div>
              </div>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${achieved ? 100 : pct}%`, backgroundColor: ringColor }} />
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-xs text-gray-400">{isDebt ? `${fmtCr(outstanding)} still owed` : `${fmtCr(Math.max(0, target - (goal.current_amount || 0)))} remaining`}</span>
                <span className="text-xs text-gray-400">by {fmtDate(goal.target_date)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        {isDebt ? (
          <>
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <p className="text-xs text-gray-400 mb-1">Current EMI</p>
              <p className="text-lg font-bold text-gray-900">{fmtCr(goal.monthly_emi || 0)}/mo</p>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <p className="text-xs text-gray-400 mb-1">Extra Monthly Needed</p>
              <p className="text-lg font-bold" style={{ color: accent }}>{fmtCr(debtStats.extraMonthly)}/mo</p>
              <p className="text-xs text-gray-400 mt-0.5">to hit early payoff date</p>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <p className="text-xs text-gray-400 mb-1">Est. Interest Saved</p>
              <p className="text-lg font-bold text-green-600">{fmtCr(debtStats.interestSaved)}</p>
              <p className="text-xs text-gray-400 mt-0.5">~{Math.round(debtStats.monthsSaved)} months early, ~{debtStats.rate}% p.a.</p>
            </div>
          </>
        ) : (
          <>
            {(isLife || (goal.type === 'custom' && goal.inflation_adjust)) && (
              <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                <p className="text-xs text-gray-400 mb-1">Today's Cost</p>
                <p className="text-lg font-bold text-gray-900">{fmtCr(goal.target_amount || 0)}</p>
                {Boolean(goal.inflation_adjust) && <p className="text-xs text-gray-400 mt-0.5">{goal.inflation_rate}% inflation/yr</p>}
              </div>
            )}
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              {needed === null ? (
                <>
                  <p className="text-xs text-gray-400 mb-1">Timeline</p>
                  <p className="text-lg font-bold text-gray-700">Open-ended</p>
                  <p className="text-xs text-gray-400 mt-0.5">No target date — tracking progress only</p>
                </>
              ) : (
                <>
                  <p className="text-xs text-gray-400 mb-1">{isLife ? 'Monthly SIP Needed' : 'Monthly Needed'}</p>
                  <p className="text-lg font-bold" style={{ color: accent }}>{fmtCr(needed)}/mo</p>
                  <p className="text-xs text-gray-400 mt-0.5">{isLife ? 'at 12% expected return' : 'to reach target on time'}</p>
                </>
              )}
            </div>
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <p className="text-xs text-gray-400 mb-1">Category</p>
              <p className="text-lg font-bold text-gray-900">{goal.category === 'want' ? 'Want' : 'Need'}</p>
            </div>
          </>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
        <h2 className="font-semibold text-gray-800 mb-3">Where the Money Sits</h2>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-800">{goal.bank_or_provider || '—'}</p>
          {linkedInvestments.length > 0 && (
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-600">Auto-synced</span>
          )}
        </div>
        {goal.last_synced_at && (
          <p className="text-xs text-gray-400 mt-2">Last synced: {fmtDateTime(goal.last_synced_at)}</p>
        )}
        {goal.notes && <p className="text-sm text-gray-500 mt-3 pt-3 border-t border-gray-50">{goal.notes}</p>}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800">Linked Investments</h2>
            <p className="text-xs text-gray-400 mt-0.5">{linkedInvestments.length} investment{linkedInvestments.length !== 1 ? 's' : ''} funding this goal</p>
          </div>
          {linkedInvestments.length > 0 && (
            <button onClick={onSyncAll} disabled={syncing}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50">
              {syncing ? 'Syncing…' : '↻ Sync All'}
            </button>
          )}
        </div>
        {linkedInvestments.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-sm text-gray-400">No investments linked. Edit this goal to link some.</div>
        ) : (
          <>
            {totalSip > 0 && (
              <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-100">
                <p className="text-sm font-semibold text-indigo-700">💹 {fmtCr(totalSip)}/mo flowing into this goal via SIPs</p>
              </div>
            )}
            <div className="divide-y divide-gray-50">
              {linkedInvestments.map(inv => (
                <div key={inv.id} className="flex items-center justify-between px-5 py-3.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-800 truncate">{inv.name}</p>
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500 shrink-0">{INV_TYPE_LABELS[inv.type] || inv.type}</span>
                    </div>
                    {['mf_sip', 'rd'].includes(inv.type) && inv.monthly_sip_amount > 0 && (
                      <p className="text-xs text-indigo-600 mt-0.5">Contributing {fmtCr(inv.monthly_sip_amount)}/mo to this goal</p>
                    )}
                  </div>
                  <span className="font-semibold text-gray-800 shrink-0 ml-3">{fmtCr(inv.current_value)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800">Contribution History</h2>
            <p className="text-xs text-gray-400 mt-0.5">{contributions.length} entr{contributions.length !== 1 ? 'ies' : 'y'}</p>
          </div>
          <button onClick={onAddContribution} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-white text-xs font-semibold hover:opacity-90 transition-opacity" style={{ backgroundColor: accent }}>
            <span>+</span> {isDebt ? 'Update Balance' : 'Add Contribution'}
          </button>
        </div>
        {contributions.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-sm text-gray-400">No contributions logged yet.</div>
        ) : (
          <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
            {contributions.map(c => (
              <div key={c.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p className="text-sm font-medium text-gray-800">{c.note || (c.contribution_type === 'auto_linked' ? 'Auto-synced' : 'Manual update')}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{fmtDate(c.contributed_at)} · {c.contribution_type === 'auto_linked' ? 'Auto-linked' : 'Manual'}</p>
                </div>
                <span className={`font-semibold ${c.amount >= 0 ? 'text-green-600' : 'text-red-500'}`}>{c.amount >= 0 ? '+' : ''}{fmtCr(c.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Goals page ──────────────────────────────────────────────────────────
export default function Goals() {
  const [goals, setGoals] = useState([])
  const [investments, setInvestments] = useState([])
  const [goalInvestmentsMap, setGoalInvestmentsMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('grid')
  const [selectedGoal, setSelectedGoal] = useState(null)
  const [contributions, setContributions] = useState([])
  const [detailInvestments, setDetailInvestments] = useState([])
  const [syncing, setSyncing] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  const [editGoal, setEditGoal] = useState(null)
  const [contribGoal, setContribGoal] = useState(null)
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [g, inv, links] = await Promise.all([
        window.electronAPI.getAllGoals(),
        window.electronAPI.getAllInvestments(),
        window.electronAPI.getAllGoalInvestmentLinks(),
      ])
      setGoals(g || [])
      setInvestments(inv || [])
      const map = {}
      for (const row of links || []) {
        if (!map[row.goal_id]) map[row.goal_id] = []
        map[row.goal_id].push(row)
      }
      setGoalInvestmentsMap(map)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openDetail = useCallback(async (goal) => {
    setSelectedGoal(goal)
    setContributions([])
    setDetailInvestments([])
    try {
      const res = await window.electronAPI.syncGoalInvestment(goal.id)
      if (res?.synced) {
        const fresh = await window.electronAPI.getAllGoals()
        setGoals(fresh || [])
        const updated = (fresh || []).find(x => x.id === goal.id)
        if (updated) setSelectedGoal(updated)
      }
    } catch (e) { console.error(e) }
    try {
      const [c, inv] = await Promise.all([
        window.electronAPI.getGoalContributions(goal.id),
        window.electronAPI.getGoalInvestments(goal.id),
      ])
      setContributions(c || [])
      setDetailInvestments(inv || [])
    } catch (e) { console.error(e) }
  }, [])

  const closeDetail = () => { setSelectedGoal(null); setContributions([]); setDetailInvestments([]) }
  const openWizard = (goal = null) => { setEditGoal(goal); setShowWizard(true) }
  const closeWizard = () => { setEditGoal(null); setShowWizard(false) }
  const openContribution = (goal) => setContribGoal(goal)
  const closeContribution = () => setContribGoal(null)

  const handleSaveGoal = async (payload) => {
    const { linkedInvestmentIds, ...goalData } = payload
    let goalId
    if (editGoal) {
      await window.electronAPI.updateGoal({ ...goalData, id: editGoal.id, is_achieved: editGoal.is_achieved, achieved_at: editGoal.achieved_at })
      goalId = editGoal.id
    } else {
      const { id } = await window.electronAPI.createGoal(goalData)
      goalId = id
    }
    await window.electronAPI.setGoalInvestments(goalId, linkedInvestmentIds || [])
    closeWizard()
    await load()
    if (selectedGoal && goalId === selectedGoal.id) {
      const [fresh, inv] = await Promise.all([
        window.electronAPI.getAllGoals(),
        window.electronAPI.getGoalInvestments(goalId),
      ])
      setSelectedGoal(fresh.find(g => g.id === goalId) || null)
      setDetailInvestments(inv || [])
    }
  }

  const handleSyncAll = async () => {
    if (!selectedGoal) return
    setSyncing(true)
    try {
      const result = await window.electronAPI.syncGoalInvestment(selectedGoal.id)
      const [fresh, c, inv] = await Promise.all([
        window.electronAPI.getAllGoals(),
        window.electronAPI.getGoalContributions(selectedGoal.id),
        window.electronAPI.getGoalInvestments(selectedGoal.id),
      ])
      setGoals(fresh || [])
      setSelectedGoal(fresh.find(g => g.id === selectedGoal.id) || null)
      setContributions(c || [])
      setDetailInvestments(inv || [])
      if (result?.synced) {
        showToast(`Synced! Current amount updated to ${fmtCr(result.newAmount)}`)
      } else {
        showToast('No linked investments to sync', 'warn')
      }
    } finally {
      setSyncing(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this goal? This also removes its contribution history.')) return
    await window.electronAPI.deleteGoal(id)
    if (selectedGoal?.id === id) closeDetail()
    await load()
  }

  const handleAchieve = async (goal) => {
    await window.electronAPI.updateGoal({ ...goal, is_achieved: true })
    await load()
    setSelectedGoal(prev => (prev ? { ...prev, is_achieved: 1, achieved_at: new Date().toISOString() } : prev))
  }

  const handleAddContribution = async (payload) => {
    await window.electronAPI.addGoalContribution(payload)
    closeContribution()
    await load()
    if (selectedGoal?.id === payload.goal_id) {
      const [fresh, c] = await Promise.all([
        window.electronAPI.getAllGoals(),
        window.electronAPI.getGoalContributions(payload.goal_id),
      ])
      setSelectedGoal(fresh.find(g => g.id === payload.goal_id) || null)
      setContributions(c || [])
    }
  }

  const sorted = useMemo(() => {
    const active = goals.filter(g => !g.is_achieved)
    const achieved = goals.filter(g => g.is_achieved)
    active.sort((a, b) => {
      const da = daysRemaining(a.target_date)
      const db_ = daysRemaining(b.target_date)
      if (da === null && db_ === null) return 0
      if (da === null) return 1
      if (db_ === null) return -1
      return da - db_
    })
    achieved.sort((a, b) => new Date(b.achieved_at || 0) - new Date(a.achieved_at || 0))
    return [...active, ...achieved]
  }, [goals])

  const activeGoals = goals.filter(g => !g.is_achieved)
  const achievedGoals = goals.filter(g => g.is_achieved)
  const totalTarget = activeGoals.reduce((s, g) => s + effectiveTarget(g), 0)
  const totalSaved = activeGoals.reduce((s, g) => s + (g.current_amount || 0), 0)
  const overallPct = totalTarget > 0 ? Math.min(100, (totalSaved / totalTarget) * 100) : 0

  if (selectedGoal) {
    const live = goals.find(g => g.id === selectedGoal.id) || selectedGoal
    return (
      <>
        <GoalDetailScreen
          goal={live}
          linkedInvestments={detailInvestments}
          contributions={contributions}
          syncing={syncing}
          onBack={closeDetail}
          onEdit={() => openWizard(live)}
          onAchieve={() => handleAchieve(live)}
          onAddContribution={() => openContribution(live)}
          onSyncAll={handleSyncAll}
        />
        {showWizard && (
          <GoalFormWizard initial={editGoal} investments={investments} onSave={handleSaveGoal} onClose={closeWizard} />
        )}
        {contribGoal && (
          <AddContributionModal goal={contribGoal} onSave={handleAddContribution} onClose={closeContribution} />
        )}
        {toast && (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold text-white animate-in"
            style={{ backgroundColor: toast.type === 'error' ? '#EF4444' : toast.type === 'warn' ? '#F59E0B' : '#10B981' }}>
            {toast.type === 'error' ? '✗' : '✓'} {toast.msg}
          </div>
        )}
      </>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Goals</h2>
          <p className="text-sm text-gray-500 mt-0.5">{activeGoals.length} active · {achievedGoals.length} achieved</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-gray-200 overflow-hidden">
            <button onClick={() => setView('grid')} title="Card grid view"
              className="p-2.5 transition-colors" style={{ backgroundColor: view === 'grid' ? '#1a1a2e' : '#fff', color: view === 'grid' ? '#fff' : '#9ca3af' }}>
              <GridIcon />
            </button>
            <button onClick={() => setView('list')} title="List view"
              className="p-2.5 transition-colors" style={{ backgroundColor: view === 'list' ? '#1a1a2e' : '#fff', color: view === 'list' ? '#fff' : '#9ca3af' }}>
              <ListIcon />
            </button>
          </div>
          <button
            onClick={() => openWizard(null)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            style={{ backgroundColor: '#6C63FF' }}
          >
            <span className="text-base font-bold leading-none">+</span>
            Add Goal
          </button>
        </div>
      </div>

      {goals.length > 0 && (
        <SummaryBar activeCount={activeGoals.length} achievedCount={achievedGoals.length}
          totalTarget={totalTarget} totalSaved={totalSaved} overallPct={overallPct} />
      )}

      {loading ? (
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-56 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex items-center justify-center h-56 rounded-2xl bg-white border border-dashed border-gray-200">
          <div className="text-center">
            <p className="text-4xl mb-3">🎯</p>
            <p className="text-base font-semibold text-gray-700">No goals yet</p>
            <p className="text-sm text-gray-400 mt-1">+ Add Goal to start tracking an emergency fund, life goal, or debt payoff</p>
          </div>
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
          {sorted.map(g => (
            <GoalCardGrid key={g.id} goal={g} linkedInvestments={goalInvestmentsMap[g.id]}
              onView={openDetail} onEdit={openWizard} onDelete={handleDelete} onContribute={openContribution} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(g => (
            <GoalListRow key={g.id} goal={g} linkedInvestments={goalInvestmentsMap[g.id]}
              onView={openDetail} onEdit={openWizard} onDelete={handleDelete} onContribute={openContribution} />
          ))}
        </div>
      )}

      {showWizard && (
        <GoalFormWizard initial={editGoal} investments={investments} onSave={handleSaveGoal} onClose={closeWizard} />
      )}
      {contribGoal && (
        <AddContributionModal goal={contribGoal} onSave={handleAddContribution} onClose={closeContribution} />
      )}
    </div>
  )
}
