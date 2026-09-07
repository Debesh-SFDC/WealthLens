import { useState, useEffect, useRef } from 'react'
import bridge from '../lib/bridge'
import { FIRE_MULTIPLIERS } from '../utils/fireCalc'

// ── Formatters ────────────────────────────────────────────────────────────
function fmtCr(v) {
  const n = Number(v) || 0
  const abs = Math.abs(n)
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`
  if (abs >= 1e3) return `₹${(n / 1e3).toFixed(0)}K`
  return `₹${Math.round(n)}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtDate(d) {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

// ── Date maths ────────────────────────────────────────────────────────────
// Calendar-accurate year/month/day difference between two dates (from <= to).
// Borrows days from the actual previous month of `to`, so month lengths and
// leap years are handled correctly.
function diffYMD(from, to) {
  let years = to.getFullYear() - from.getFullYear()
  let months = to.getMonth() - from.getMonth()
  let days = to.getDate() - from.getDate()

  if (days < 0) {
    months -= 1
    const daysInPrevMonth = new Date(to.getFullYear(), to.getMonth(), 0).getDate()
    days += daysInPrevMonth
  }
  if (months < 0) {
    years -= 1
    months += 12
  }
  return { years, months, days }
}

function addYears(date, n) {
  const d = new Date(date)
  d.setFullYear(d.getFullYear() + n)
  return d
}

// ── Count-up hook (numbers animate 0 → value on mount, ~1s, ease-out) ─────
function useCountUp(target, duration = 1000) {
  const [value, setValue] = useState(0)
  const rafRef = useRef(null)

  useEffect(() => {
    const safeTarget = Number.isFinite(target) ? target : 0
    let startTs = null
    const tick = (ts) => {
      if (startTs === null) startTs = ts
      const p = Math.min(1, (ts - startTs) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(Math.round(safeTarget * eased))
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
      else setValue(safeTarget)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])

  return value
}

function NumberBox({ value, label, size = 'lg' }) {
  const shown = useCountUp(value)
  const numCls = size === 'lg'
    ? 'text-3xl sm:text-5xl'
    : 'text-2xl sm:text-4xl'
  return (
    <div className="flex-1 rounded-xl bg-white/10 py-3 px-2 text-center min-w-0">
      <div className={`${numCls} font-bold text-white leading-none tabular-nums`}>{shown}</div>
      <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/45">{label}</div>
    </div>
  )
}

const SCENARIOS = [
  { kids: 0, label: 'No Kids', key: 'expense_no_kids' },
  { kids: 1, label: '1 Kid', key: 'expense_one_kid' },
  { kids: 2, label: '2 Kids', key: 'expense_two_kids' },
]

const CARD_CLS = 'rounded-2xl p-5 sm:p-6 text-white shadow-lg'
const CARD_STYLE = { background: 'linear-gradient(150deg, #1a1a2e 0%, #2b1f52 55%, #3a2270 100%)' }

// ── Component ─────────────────────────────────────────────────────────────
export default function RetirementCountdown({
  currentNetWorth: currentNetWorthProp,
  profile: profileProp,
  onNavigate,
}) {
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(profileProp ?? null)
  const [fire, setFire] = useState(null)
  const [currentNetWorth, setCurrentNetWorth] = useState(currentNetWorthProp ?? 0)
  const [scenarioKids, setScenarioKids] = useState(null) // null until fire settings load

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [prof, fireRes, stats] = await Promise.all([
        profileProp ? Promise.resolve(profileProp) : bridge.getProfile().catch(() => null),
        bridge.getFireSettings().catch(() => null),
        currentNetWorthProp != null ? Promise.resolve(null) : bridge.getDashboardStats().catch(() => null),
      ])
      if (cancelled) return
      setProfile(prof)
      setFire(fireRes)
      if (fireRes) setScenarioKids(fireRes.kids_planned ?? 0)
      if (currentNetWorthProp == null && stats) setCurrentNetWorth(Number(stats.netWorth) || 0)
      setLoading(false)
    })()
    return () => { cancelled = true }
    // Load profile/FIRE settings once on mount; net-worth prop changes are
    // picked up by the effect below without a full refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (currentNetWorthProp != null) setCurrentNetWorth(Number(currentNetWorthProp) || 0)
  }, [currentNetWorthProp])

  if (loading) {
    return <div className={CARD_CLS} style={CARD_STYLE}><div className="h-40 animate-pulse rounded-xl bg-white/5" /></div>
  }

  const goToFire = onNavigate ? () => onNavigate('fire') : null

  // ── Edge case: no DOB ──────────────────────────────────────────────────
  const dobStr = profile?.date_of_birth
  if (!dobStr) {
    return (
      <div className={CARD_CLS} style={CARD_STYLE}>
        <Header />
        <p className="mt-3 text-sm text-white/70">
          Set your date of birth in Settings to see your retirement countdown.
        </p>
        {goToFire && <SettingsLink onClick={goToFire} />}
      </div>
    )
  }

  const dob = new Date(`${dobStr}T00:00:00`)
  const retirementAge = Number(profile?.retirement_age) || 60
  const retirementDate = addYears(dob, retirementAge)
  const today = new Date()
  const reached = today >= retirementDate

  // ── Corpus (only when FIRE planner has data) ───────────────────────────
  const activeKids = scenarioKids ?? 0
  const scenarioExpense = fire ? Number(fire[SCENARIOS.find(s => s.kids === activeKids).key]) || 0 : 0
  const fiMultiple = fire
    ? (fire.fi_multiple != null ? Number(fire.fi_multiple) : (FIRE_MULTIPLIERS[fire.fire_type] || 30))
    : null
  const targetCorpus = fire && scenarioExpense > 0 ? fiMultiple * scenarioExpense : 0
  const hasCorpus = targetCorpus > 0
  const progressPct = hasCorpus ? Math.min(100, (currentNetWorth / targetCorpus) * 100) : 0
  const gap = targetCorpus - currentNetWorth
  const hitFireNumber = hasCorpus && currentNetWorth >= targetCorpus
  const scenarioLabel = SCENARIOS.find(s => s.kids === activeKids)?.label

  const { years, months, days } = reached
    ? { years: 0, months: 0, days: 0 }
    : diffYMD(today, retirementDate)
  const totalMonths = years * 12 + months

  return (
    <div className={CARD_CLS} style={CARD_STYLE}>
      <Header />

      {reached ? (
        <p className="mt-4 text-lg font-bold">🎉 You've reached your retirement date!</p>
      ) : (
        <>
          {/* Clock 1 — years / months / days */}
          <div className="mt-4 flex gap-2.5 sm:gap-3">
            <NumberBox value={years} label="Years" />
            <NumberBox value={months} label="Months" />
            <NumberBox value={days} label="Days" />
          </div>

          {/* Clock 2 — total months only */}
          <div className="mt-2.5 flex gap-2.5 sm:gap-3">
            <NumberBox value={totalMonths} label="Months to go" size="sm" />
          </div>

          <p className="mt-3 text-xs text-white/55">
            Target: {fmtDate(retirementDate)}
            <span className="mx-1.5">•</span>
            Age {retirementAge}
          </p>
        </>
      )}

      {/* Corpus section */}
      {fire ? (
        hasCorpus ? (
          <>
            <div className="my-4 h-px bg-white/10" />

            {/* Scenario chips */}
            <div className="flex flex-wrap gap-1.5">
              {SCENARIOS.map(s => {
                const active = s.kids === activeKids
                return (
                  <button
                    key={s.kids}
                    onClick={() => setScenarioKids(s.kids)}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
                      active ? 'bg-white text-[#1a1a2e]' : 'bg-white/10 text-white/60 hover:bg-white/20'
                    }`}
                  >
                    {s.label}{active ? ' ✓' : ''}
                  </button>
                )
              })}
            </div>

            <div className="mt-3 space-y-1 text-sm">
              <p className="font-semibold" style={{ color: '#FBBF24' }}>
                Target Corpus: {fmtCr(targetCorpus)}
                <span className="ml-1 font-normal text-white/40">({scenarioLabel})</span>
              </p>
              <p className="text-white/90">Current: {fmtCr(currentNetWorth)}</p>
            </div>

            {hitFireNumber ? (
              <p className="mt-3 text-sm font-bold" style={{ color: '#4ADE80' }}>
                🎉 You've hit your FIRE number!
              </p>
            ) : (
              <>
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[11px] text-white/50">
                    <span>Progress</span>
                    <span>{progressPct.toFixed(1)}%</span>
                  </div>
                  <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, #8B5CF6, #A78BFA)' }}
                    />
                  </div>
                </div>
                <p className="mt-2.5 text-sm font-medium" style={{ color: '#FCA5A5' }}>
                  Need {fmtCr(gap)} more
                </p>
              </>
            )}
          </>
        ) : (
          <p className="mt-4 text-xs text-white/55">Add your annual expenses in the FIRE Planner to see your target corpus.</p>
        )
      ) : (
        <p className="mt-4 text-xs text-white/55">Set up the FIRE Planner to see your target.</p>
      )}

      {goToFire && <SettingsLink onClick={goToFire} />}
    </div>
  )
}

function Header() {
  return (
    <div className="flex items-center gap-2">
      <span className="text-lg">🏖️</span>
      <h3 className="text-sm font-bold tracking-wide">Retirement Countdown</h3>
    </div>
  )
}

function SettingsLink({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="mt-4 text-[11px] font-medium text-white/45 hover:text-white/80 transition-colors"
    >
      ⚙️ Update retirement settings
    </button>
  )
}
