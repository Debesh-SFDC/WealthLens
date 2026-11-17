import EventCard from './EventCard'
import { MONTHS, ageIn, childAgeIn, phaseFor } from '../../lib/lifeTimeline'

// Inside one year: a January–December line with items placed in their month,
// items without a month under "Sometime this year", Previous/Next year, and
// add/edit entry points. The month line scrolls sideways on phones.
export default function YearView({
  year, show, items, range, phases, birthYear, childBirthYear, backRef,
  onBack, onPrev, onNext, onAdd, onSelectItem,
}) {
  const list = items || []
  const dated = list.filter(i => i.month != null)
  const loose = list.filter(i => i.month == null)
  const age = year != null ? ageIn(year, birthYear) : null
  const child = year != null ? childAgeIn(year, childBirthYear) : null
  const phase = year != null ? phaseFor(year, phases) : null

  return (
    <section
      className={`lt-year${show ? ' show' : ''}`}
      aria-label={year != null ? `Year ${year}` : undefined}
      aria-hidden={!show}
    >
      {year != null && (
        <>
          <div className="lt-yhead">
            <button ref={backRef} type="button" className="lt-btn" onClick={onBack}>&larr; All years</button>
            <h2 className="lt-ytitle" aria-live="polite" style={{ margin: 0 }}>{year}</h2>
            <div className="lt-ymeta">
              {age != null && <>Your age <b>{age}</b></>}
              {child != null && <>{age != null && <>&nbsp;·&nbsp;</>}Child <b>{child}</b></>}
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
                return (
                  <div key={name} className={`lt-mo${inMonth.length ? ' has' : ''}`}>
                    {inMonth.length > 0 && (
                      <div className="stack">
                        {inMonth.map(it => (
                          <EventCard key={it.key} item={it} as="button" showTag onClick={() => onSelectItem(it)} />
                        ))}
                      </div>
                    )}
                    <span className="dot" />
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
                {loose.map(it => (
                  <EventCard key={it.key} item={it} as="button" showTag onClick={() => onSelectItem(it)} />
                ))}
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
