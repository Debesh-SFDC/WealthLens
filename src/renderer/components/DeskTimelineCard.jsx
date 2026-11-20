import '../lifeTimeline.css' // status-marker tokens, the Mark achieved popover and burst
import '../timelineCard.css' // the Dashboard (compact) variant
import { pickDeskItems, countdownText, overdueText, whenText, chapterText } from '../lib/deskTimeline'
import { reachedText, canMark } from '../lib/lifeTimeline'
import { Marker } from './lifeTimeline/LineCard'

const MAX_OVERDUE = 3

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="5 12.5 10 17.5 19 7" />
  </svg>
)

// Goals (and events linked to one) show their percent saved.
const hasPercent = (it) => it.percent != null && (it.kind === 'goal' || it.goal)
const plainTitle = (it) => (it.kind === 'goal' ? it.raw.title : it.title)

// "Jun 2028 · in 1 year, 7 months"
function When({ it, now, strong = true }) {
  return (
    <>
      <span className="tabular-nums">{whenText(it)}</span>
      <span aria-hidden="true"> · </span>
      {strong ? <b className="tabular-nums">{countdownText(it, now)}</b> : <span className="tabular-nums">{countdownText(it, now)}</span>}
    </>
  )
}

// Gold ring with the percent saved (goals in progress).
function ProgressRing({ percent }) {
  return (
    <div className="desk-lt-ring" role="img" aria-label={`${percent}% saved`}>
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="27" className="track" />
        <circle cx="32" cy="32" r="27" className="fill" pathLength="100" strokeDasharray={`${percent} 100`} transform="rotate(-90 32 32)" />
      </svg>
      <span><b>{percent}%</b><i>saved</i></span>
    </div>
  )
}

// The Life Timeline card: the next 3 upcoming goals or events with a live
// countdown, plus what's overdue. One component, two looks:
//   variant 'desk'    (Desk Mode) the first item large, items 2 and 3 as
//                     one-line rows, the overdue list with big checks
//   variant 'compact' (Dashboard) a normal Dashboard card: 3 rows, the first
//                     slightly larger, an amber "2 overdue" chip, a check per row
// data: the GET /api/life-timeline payload (states already derived there).
// onOpen({ year, open, filter }): go to the Life Timeline.
// onMark(item, buttonEl): open the Mark achieved popover (useTimelineCard).
export default function DeskTimelineCard({ variant = 'desk', ...props }) {
  return variant === 'compact' ? <CompactCard {...props} /> : <DeskCard {...props} />
}

function DeskCard({ data, now, onOpen, onMark, className = '' }) {
  const { upcoming, next, overdue } = pickDeskItems(data)
  const rest = upcoming.slice(1)
  const shown = overdue.slice(0, MAX_OVERDUE)
  const more = overdue.length - shown.length
  const chapter = next ? chapterText(next, data.phases) : null

  return (
    <section className={`desk-glass desk-lt lt-tokens${overdue.length ? ' has-over' : ''} ${className}`} aria-label="Life Timeline">
      <div className="desk-lt-nextcol">
        <div className={`desk-lt-next${next?.assumed ? ' assumed' : ''}`}>
          <p className="desk-lt-label">Next on your timeline</p>
          {next ? (
            <div className="desk-lt-body">
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  className="desk-lt-title"
                  onClick={() => onOpen({ year: next.year, open: true })}
                  aria-label={`${plainTitle(next)}, open the Life Timeline at ${next.year}`}
                >
                  {next.title}
                </button>
                <p className="desk-lt-when">
                  <When it={next} now={now} />
                  {next.assumed && <span className="desk-lt-assumed">assumed date</span>}
                </p>
                {(next.amountText || chapter) && (
                  <p className="desk-lt-meta">
                    {next.amountText && <span className="amt tabular-nums">{next.amountText}</span>}
                    {next.amountText && chapter && <span aria-hidden="true"> · </span>}
                    {chapter && <span>{chapter}</span>}
                  </p>
                )}
                {next.reached && onMark && (
                  <button
                    type="button"
                    className="desk-lt-reached"
                    aria-haspopup="dialog"
                    onClick={(e) => { e.stopPropagation(); onMark(next, e.currentTarget) }}
                  >
                    {reachedText(next)}
                  </button>
                )}
              </div>
              {next.state === 'in_progress' && next.percent != null && <ProgressRing percent={next.percent} />}
            </div>
          ) : (
            <p className="desk-lt-clear">
              Your timeline is clear.{' '}
              <button type="button" onClick={() => onOpen({})}>Add your next goal.</button>
            </p>
          )}
        </div>

        {rest.length > 0 && (
          <ul className="desk-lt-up" aria-label="Then">
            {rest.map(it => (
              <li key={it.key}>
                <button
                  type="button"
                  className="desk-lt-urow"
                  onClick={() => onOpen({ year: it.year, open: true })}
                  aria-label={`${plainTitle(it)}, ${whenText(it)}, ${countdownText(it, now)}${hasPercent(it) ? `, ${it.percent}% saved` : ''}. Open the Life Timeline at ${it.year}`}
                >
                  <Marker item={it} />
                  <span className="desk-lt-utitle">{it.title}</span>
                  <span className="desk-lt-uwhen"><When it={it} now={now} /></span>
                  {hasPercent(it) && <span className="desk-lt-upct tabular-nums">{it.percent}%</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {overdue.length > 0 && (
        <div className="desk-lt-over">
          <div className="desk-lt-overhead">
            <span>{overdue.length} overdue</span>
            {more > 0 && (
              <button type="button" className="desk-lt-more" onClick={() => onOpen({ year: overdue[0].year, filter: 'overdue' })}>
                +{more} more
              </button>
            )}
          </div>
          <ul>
            {shown.map(it => (
              <li key={it.key} className="desk-lt-row">
                <div className="min-w-0 flex-1">
                  <span className="desk-lt-rtitle truncate">{it.title}</span>
                  <span className="desk-lt-late tabular-nums">{overdueText(it, now)}</span>
                </div>
                <button
                  type="button"
                  className="desk-lt-check"
                  aria-label={`Mark achieved: ${plainTitle(it)}`}
                  aria-haspopup="dialog"
                  onClick={(e) => { e.stopPropagation(); onMark(it, e.currentTarget) }}
                >
                  <CheckIcon />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

// Dashboard card, styled like the Retirement Countdown above it.
function CompactCard({ data, now = new Date(), onOpen, onMark, className = '' }) {
  const { upcoming, overdue } = pickDeskItems(data)

  return (
    <section className={`ltc lt-tokens rounded-2xl p-5 sm:p-6 text-white shadow-lg ${className}`} aria-labelledby="ltc-h">
      <div className="ltc-head">
        <span className="text-lg" aria-hidden="true">🧭</span>
        <h3 id="ltc-h" className="text-sm font-bold tracking-wide">Next on your timeline</h3>
        {overdue.length > 0 && (
          <button
            type="button"
            className="ltc-over"
            onClick={() => onOpen({ year: overdue[0].year, filter: 'overdue' })}
            aria-label={`${overdue.length} overdue, open the Life Timeline filtered to overdue`}
          >
            {overdue.length} overdue
          </button>
        )}
      </div>

      {upcoming.length ? (
        <ul className="ltc-list">
          {upcoming.map((it, i) => (
            <li key={it.key} className={`ltc-row${i === 0 ? ' first' : ''}${it.assumed ? ' assumed' : ''}`}>
              <button
                type="button"
                className="ltc-open"
                onClick={() => onOpen({ year: it.year, open: true })}
                aria-label={`${plainTitle(it)}, ${whenText(it)}, ${countdownText(it, now)}${hasPercent(it) ? `, ${it.percent}% saved` : ''}. Open the Life Timeline at ${it.year}`}
              >
                <Marker item={it} />
                <span className="ltc-text">
                  <span className="ltc-title">{it.title}</span>
                  <span className="ltc-when"><When it={it} now={now} />{it.assumed && <span className="ltc-assumed"> · assumed</span>}</span>
                  {i === 0 && it.amountText && <span className="ltc-amt tabular-nums">{it.amountText}</span>}
                </span>
                {hasPercent(it) && <span className="ltc-pct tabular-nums">{it.percent}%</span>}
              </button>
              {canMark(it) && onMark && (
                <button
                  type="button"
                  className={`ltc-check${it.reached ? ' reached' : ''}`}
                  aria-label={it.reached ? `${reachedText(it)} ${plainTitle(it)}` : `Mark achieved: ${plainTitle(it)}`}
                  title={it.reached ? reachedText(it) : 'Mark achieved'}
                  aria-haspopup="dialog"
                  onClick={(e) => { e.stopPropagation(); onMark(it, e.currentTarget) }}
                >
                  <CheckIcon />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="ltc-clear">
          Your timeline is clear.{' '}
          <button type="button" onClick={() => onOpen({})}>Add your next goal.</button>
        </p>
      )}
    </section>
  )
}
