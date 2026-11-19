import EventCard from './EventCard'
import { MONTHS, ageIn, kidsAgesIn, phaseFor, matchesFilter, groupState } from '../../lib/lifeTimeline'

// Inside one year: a January–December line with items placed in their month,
// items without a month under "Sometime this year", Previous/Next year, and
// add/edit entry points. The month line scrolls sideways on phones.
export default function YearView({
  year, show, items, range, phases, birthYear, kids, backRef, backLabel = '← All years',
  onBack, onPrev, onNext, onAdd, onSelectItem, onMark, filter,
}) {
  const list = items || []
  const dated = list.filter(i => i.month != null)
  const loose = list.filter(i => i.month == null)
  const age = year != null ? ageIn(year, birthYear) : null
  const kidAges = year != null ? kidsAgesIn(year, kids) : []
  const child = kidAges.length ? kidAges.join(', ') : null
  const phase = year != null ? phaseFor(year, phases) : null
  // Filtered-out items stay in place, dimmed (same rule as the line).
  const card = (it) => (
    <div key={it.key} className={`lt-fitem${matchesFilter(it, filter) ? '' : ' lt-off'}`}>
      <EventCard item={it} as="button" showTag onClick={() => onSelectItem(it)} onMark={onMark} />
    </div>
  )

  return (
    <section
      className={`lt-year${show ? ' show' : ''}`}
      aria-label={year != null ? `Year ${year}` : undefined}
      aria-hidden={!show}
    >
      {year != null && (
        <>
          <div className="lt-yhead">
            <button ref={backRef} type="button" className="lt-btn" onClick={onBack}>{backLabel}</button>
            <h2 className="lt-ytitle" aria-live="polite" style={{ margin: 0 }}>{year}</h2>
            <div className="lt-ymeta">
              {age != null && <>Your age <b>{age}</b></>}
              {child != null && <>{age != null && <>&nbsp;·&nbsp;</>}{kidAges.length > 1 ? 'Kids' : 'Child'} <b>{child}</b></>}
              {phase && <>{(age != null || child != null) && <>&nbsp;·&nbsp;</>}Chapter {phase.numeral ? `${phase.numeral}, ` : ''}{phase.name}</>}
            </div>
            <div className="lt-navs">
              <button type="button" className="lt-btn" onClick={onPrev} disabled={year <= range.start}>&larr; Previous year</button>
              <button type="button" className="lt-btn" onClick={onNext} disabled={year >= range.end}>Next year &rarr;</button>
              <button type="button" className="lt-btn gold" onClick={onAdd}>+ Add event</button>
            </div>
          </div>

          <div className="lt-mwrap">
            <div className="lt-months">
              {MONTHS.map((name, i) => {
                const inMonth = dated.filter(it => it.month === i + 1)
                const g = inMonth.length ? groupState(inMonth) : null
                return (
                  <div key={name} className={`lt-mo${inMonth.length ? ' has' : ''}${g?.state ? ` st-${g.state}` : ''}`}>
                    {inMonth.length > 0 && (
                      <div className="stack">
                        {inMonth.map(card)}
                      </div>
                    )}
                    <span className="dot">
                      {g?.state === 'in_progress' && g.percent != null && <span className="ring" style={{ '--p': g.percent }} />}
                      {g?.state === 'achieved' && (
                        <span className="chk"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round"><polyline points="5 12.5 10 17.5 19 7" /></svg></span>
                      )}
                    </span>
                    <span className="mn">{name.toUpperCase()}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="lt-loose">
            {loose.length > 0 ? (
              <>
                <h2>Sometime this year</h2>
                {loose.map(card)}
              </>
            ) : list.length === 0 && (
              <p className="lt-quiet">
                Nothing is planned for {year} yet.
                <button type="button" className="lt-btn gold" onClick={onAdd}>+ Add event</button>
              </p>
            )}
          </div>
        </>
      )}
    </section>
  )
}
