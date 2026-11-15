// Run: node src/renderer/lib/tasks.test.js   (plain node:assert, no deps)
import assert from 'node:assert/strict'
import * as m from './tasks.js'

const today = '2026-11-15'
const T=(due,extra={})=>({type:'task',status:'pending',priority:'medium',due_date:due,...extra})
assert.equal(m.relativeDue(T('2026-11-12'),today).label,'3d overdue')
assert.equal(m.relativeDue(T('2026-11-15T09:00'),today).label,'Today')
assert.equal(m.relativeDue(T('2026-11-16'),today).label,'Tomorrow')
assert.equal(m.relativeDue(T('2026-11-19'),today).label,'Thu 19 Nov')
assert.equal(m.relativeDue(T('2026-12-12'),today).label,'12 Dec')
assert.equal(m.relativeDue(T('2027-01-02'),today).label,'2 Jan 2027')
assert.equal(m.relativeDue(T(null),today).label,'No date')
const list=[T(null,{id:1}),T('2026-11-20',{id:2}),T('2026-11-10',{id:3}),T('2026-11-20',{id:4,priority:'high'}),T('2026-11-15',{id:5})]
assert.deepEqual(list.sort(m.sortByDeadline).map(t=>t.id),[3,5,4,2,1])
const c=m.deadlineCounts([T('2026-11-10'),T('2026-11-15'),T('2026-11-22'),T('2026-11-23'),T(null),{type:'task',status:'done',done_at:new Date().toISOString()},{type:'idea',status:'pending',due_date:'2026-11-01'}],today)
assert.deepEqual(c,{overdue:1,today:1,week:1,doneToday:1})
assert.equal(m.addDays('2026-12-31',1),'2027-01-01')
console.log('ok')
