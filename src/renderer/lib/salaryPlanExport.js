import XLSX from 'xlsx-js-style'

// Bucket order + labels shared by the PDF (print) and Excel exports
export const EXPORT_BUCKETS = [
  { key: 'needs',      label: 'Needs' },
  { key: 'wants',      label: 'Wants' },
  { key: 'investment', label: 'Investments' },
]

// Groups plan items by bucket and computes the totals both exports show
export function buildPlanSummary(plan) {
  const salary = Number(plan.monthly_salary) || 0
  const items = (plan.items || []).map(i => ({ ...i, amount: Number(i.amount) || 0 }))
  const groups = EXPORT_BUCKETS.map(b => {
    const rows = items.filter(i => i.category === b.key)
    return { ...b, rows, subtotal: rows.reduce((s, i) => s + i.amount, 0) }
  })
  const totalAllocated = groups.reduce((s, g) => s + g.subtotal, 0)
  return { salary, groups, totalAllocated, unallocated: salary - totalAllocated }
}

const monthYear = iso => iso
  ? new Date(iso).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
  : ''

export function planPeriod(plan) {
  return `${monthYear(plan.effective_from)} — ${plan.effective_to ? monthYear(plan.effective_to) : 'Present'}`
}

// "Jun 2026" -> "Jun2026"; 2026-10-12 -> "12Oct2026"
export function exportFileName(plan, now = new Date()) {
  const name = String(plan.label || 'Plan').replace(/[^A-Za-z0-9]+/g, '') || 'Plan'
  const d = `${now.getDate()}${now.toLocaleDateString('en-US', { month: 'short' })}${now.getFullYear()}`
  return `Lifelog_SalaryPlan_${name}_${d}.xlsx`
}

// ── Excel ─────────────────────────────────────────────────────────────────
// Indian digit grouping (₹2,46,000) with the rupee sign
const INR_FMT = '[>=10000000]"₹"##\\,##\\,##\\,##0;[>=100000]"₹"##\\,##\\,##0;"₹"##,##0'
const PCT_FMT = '0.0%'

const FONT = { name: 'Arial', sz: 10 }
const border = { bottom: { style: 'thin', color: { rgb: 'D1D5DB' } } }
const STYLES = {
  header:   { font: { ...FONT, bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '6C63FF' } }, border },
  item:     { font: FONT },
  subtotal: { font: { ...FONT, bold: true }, fill: { fgColor: { rgb: 'F3F4F6' } }, border },
  total:    { font: { ...FONT, bold: true }, fill: { fgColor: { rgb: 'D1D5DB' } }, border },
}

const textCell = (v, s) => ({ t: 's', v: v ?? '', s })
const amountCell = (v, s, f) => ({ t: 'n', v, ...(f && { f }), s: { ...s, numFmt: INR_FMT } })
const pctCell = (v, s, f) => ({ t: 'n', v, ...(f && { f }), s: { ...s, numFmt: PCT_FMT } })

function buildPlanSheet(summary) {
  const { salary, groups, totalAllocated, unallocated } = summary
  const pct = v => (salary ? v / salary : 0)
  const rows = [[
    'Category', 'Item Name', 'Bank/Provider', 'Amount (₹)', '% of Salary',
  ].map(h => textCell(h, STYLES.header))]

  // Rows are 1-indexed in Excel; header is row 1. Salary row ref is filled in after layout.
  const subtotalRefs = {}
  const pending = [] // [rowIdx, amount] whose % formula needs the salary row
  for (const g of groups) {
    const first = rows.length + 1
    for (const item of g.rows) {
      pending.push(rows.length)
      rows.push([
        textCell(g.label, STYLES.item),
        textCell(item.name, STYLES.item),
        textCell(item.bank_or_provider || '', STYLES.item),
        amountCell(item.amount, STYLES.item),
        pctCell(pct(item.amount), STYLES.item),
      ])
    }
    const last = rows.length
    const r = rows.length + 1
    subtotalRefs[g.key] = `D${r}`
    pending.push(rows.length)
    rows.push([
      textCell(g.label, STYLES.subtotal),
      textCell('SUBTOTAL', STYLES.subtotal),
      textCell('', STYLES.subtotal),
      amountCell(g.subtotal, STYLES.subtotal, last >= first ? `SUM(D${first}:D${last})` : '0'),
      pctCell(pct(g.subtotal), STYLES.subtotal),
    ])
  }

  const totalRow = rows.length + 1
  const unallocRow = totalRow + 1
  const salaryRow = totalRow + 2
  const subtotalSum = Object.values(subtotalRefs).join('+') || '0'
  pending.push(rows.length, rows.length + 1)
  rows.push(
    [textCell('', STYLES.total), textCell('TOTAL ALLOCATED', STYLES.total), textCell('', STYLES.total),
      amountCell(totalAllocated, STYLES.total, subtotalSum), pctCell(pct(totalAllocated), STYLES.total)],
    [textCell('', STYLES.total), textCell('UNALLOCATED', STYLES.total), textCell('', STYLES.total),
      amountCell(unallocated, STYLES.total, `D${salaryRow}-D${totalRow}`), pctCell(pct(unallocated), STYLES.total)],
    [textCell('', STYLES.total), textCell('MONTHLY SALARY', STYLES.total), textCell('', STYLES.total),
      amountCell(salary, STYLES.total), pctCell(salary ? 1 : 0, STYLES.total)],
  )
  rows[salaryRow - 1][4].f = `IF($D$${salaryRow}=0,0,D${salaryRow}/$D$${salaryRow})`

  for (const idx of pending) {
    const r = idx + 1
    rows[idx][4].f = `IF($D$${salaryRow}=0,0,D${r}/$D$${salaryRow})`
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 18 }, { wch: 16 }, { wch: 13 }]
  return { ws, subtotalRefs, totalRow, unallocRow, salaryRow }
}

function buildSummarySheet(summary, refs) {
  const { salary, groups, unallocated } = summary
  const pct = v => (salary ? v / salary : 0)
  const src = `'Salary Plan'!`
  const rows = [['Bucket', 'Amount', '% of Salary'].map(h => textCell(h, STYLES.header))]
  const salaryRow = groups.length + 3

  const bucketRows = [
    ...groups.map(g => [g.label, g.subtotal, `${src}${refs.subtotalRefs[g.key]}`]),
    ['Unallocated', unallocated, `${src}D${refs.unallocRow}`],
  ]
  for (const [label, v, f] of bucketRows) {
    const r = rows.length + 1
    rows.push([
      textCell(label, STYLES.item),
      amountCell(v, STYLES.item, f),
      pctCell(pct(v), STYLES.item, `IF($B$${salaryRow}=0,0,B${r}/$B$${salaryRow})`),
    ])
  }
  rows.push([
    textCell('Total', STYLES.total),
    amountCell(salary, STYLES.total, `${src}D${refs.salaryRow}`),
    pctCell(salary ? 1 : 0, STYLES.total, `IF($B$${salaryRow}=0,0,B${salaryRow}/$B$${salaryRow})`),
  ])

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 16 }, { wch: 16 }, { wch: 13 }]
  return ws
}

export function exportPlanToExcel(plan) {
  const summary = buildPlanSummary(plan)
  const wb = XLSX.utils.book_new()
  const planSheet = buildPlanSheet(summary)
  XLSX.utils.book_append_sheet(wb, planSheet.ws, 'Salary Plan')
  XLSX.utils.book_append_sheet(wb, buildSummarySheet(summary, planSheet), 'Summary')

  // Blob download works in both the browser and Electron renderer
  const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = exportFileName(plan)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
