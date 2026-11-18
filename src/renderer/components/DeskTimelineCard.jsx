import { pickDeskItems, countdownText, overdueText, whenText, chapterText } from '../lib/deskTimeline'

const MAX_OVERDUE = 3

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="5 12.5 10 17.5 19 7" />
  </svg>
)

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

// Desk Mode's Life Timeline card: the next upcoming goal or event with a live
// countdown, and the overdue ones with a big check to mark them achieved.
// data: the GET /api/life-timeline payload (states already derived there).
// onOpen({ year, open, filter }): leave Desk Mode for the Life Timeline.
// onMark(item, buttonEl): open the Mark achieved popover.
export default function DeskTimelineCard({ data, now, onOpen, onMark, className = '' }) {
  const { next, overdue } = pickDeskItems(data)
  const shown = overdue.slice(0, MAX_OVERDUE)
  const more = overdue.length - shown.length
  const chapter = next ? chapterText(next, data.phases) : null

  return (
    <section className={`desk-glass desk-lt${overdue.length ? ' has-over' : ''} ${className}`} aria-label="Life Timeline">
      <div className={`desk-lt-next${next?.assumed ? ' assumed' : ''}`}>
        <p className="desk-lt-label">Next on your timeline</p>
        {next ? (
          <div className="desk-lt-body">
            <div className="min-w-0 flex-1">
              <button
                type="button"
                className="desk-lt-title"
                onClick={() => onOpen({ year: next.year, open: true })}
                aria-label={`${next.kind === 'goal' ? next.raw.title : next.title}, open the Life Timeline at ${next.year}`}
              >
                {next.title}
              </button>
              <p className="desk-lt-when">
                <span className="tabular-nums">{whenText(next)}</span>
                <span aria-hidden="true"> · </span>
                <b className="tabular-nums">{countdownText(next, now)}</b>
                {next.assumed && <span className="desk-lt-assumed">assumed date</span>}
              </p>
              {(next.amountText || chapter) && (
                <p className="desk-lt-meta">
                  {next.amountText && <span className="amt tabular-nums">{next.amountText}</span>}
                  {next.amountText && chapter && <span aria-hidden="true"> · </span>}
                  {chapter && <span>{chapter}</span>}
                </p>
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
            {shown.map(it => {
              const title = it.kind === 'goal' ? it.raw.title : it.title
              return (
                <li key={it.key} className="desk-lt-row">
                  <div className="min-w-0 flex-1">
                    <span className="desk-lt-rtitle truncate">{it.title}</span>
                    <span className="desk-lt-late tabular-nums">{overdueText(it, now)}</span>
                  </div>
                  <button
                    type="button"
                    className="desk-lt-check"
                    aria-label={`Mark achieved: ${title}`}
                    aria-haspopup="dialog"
                    onClick={(e) => { e.stopPropagation(); onMark(it, e.currentTarget) }}
                  >
                    <CheckIcon />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
