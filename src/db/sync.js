// ── Row-level Google Drive sync engine ──────────────────────────────────────
// Builds/reads the single WealthLens_sync.json payload and merges it into the
// local SQLite store using last-write-wins per row (compared by each table's
// timestamp column). Local integer primary keys never leave this device —
// every row is addressed by its sync_id (UUID) in the payload, and foreign
// keys are translated to the referenced row's sync_id on the way out and
// resolved back to a local integer id on the way in.

const SYNC_VERSION = 1

function fillDefaults(row, defaults) {
  const out = { ...defaults, ...row }
  for (const k of Object.keys(out)) if (out[k] === undefined) out[k] = defaults[k] ?? null
  return out
}

// Builds the full local snapshot in the shared JSON shape.
export function getSyncSnapshot(db) {
  const expenses = db.prepare(`
    SELECT e.sync_id as id, e.amount, e.category, e.note, e.date,
           e.created_at, e.updated_at, e.deleted_at, e.device_id,
           u.name as logged_by_user_name
    FROM expenses e LEFT JOIN users u ON u.id = e.logged_by_user_id
    WHERE e.sync_id IS NOT NULL
  `).all()

  const goals = db.prepare(`
    SELECT sync_id as id, title, type, category, target_amount, current_amount, target_date,
           bank_or_provider, emoji, color, inflation_adjust, inflation_rate, monthly_emi, notes,
           is_achieved, achieved_at, created_at, updated_at, deleted_at, device_id
    FROM goals WHERE sync_id IS NOT NULL
  `).all()

  const goal_contributions = db.prepare(`
    SELECT gc.sync_id as id, g.sync_id as goal_id, gc.amount, gc.note, gc.contributed_at,
           gc.contribution_type, gc.created_at, gc.updated_at, gc.deleted_at, gc.device_id
    FROM goal_contributions gc JOIN goals g ON g.id = gc.goal_id
    WHERE gc.sync_id IS NOT NULL
  `).all()

  const goal_investments = db.prepare(`
    SELECT gi.sync_id as id, g.sync_id as goal_id, i.sync_id as investment_id,
           gi.created_at, gi.updated_at, gi.deleted_at, gi.device_id
    FROM goal_investments gi
    JOIN goals g ON g.id = gi.goal_id
    JOIN investments i ON i.id = gi.investment_id
    WHERE gi.sync_id IS NOT NULL
  `).all()

  const investments = db.prepare(`
    SELECT i.sync_id as id, i.name, i.type, i.provider, i.bank_or_amc, i.account_number,
           i.invested_amount, i.current_value, i.monthly_sip_amount, i.sip_frequency,
           i.start_date, i.maturity_date, g.sync_id as goal_id, i.notes, i.units,
           i.purchase_price, i.scheme_code, i.interest_rate, i.ticker_symbol, i.exchange,
           i.purity, i.sip_last_applied_at, i.created_at, i.last_updated_at as updated_at,
           i.deleted_at, i.device_id
    FROM investments i LEFT JOIN goals g ON g.id = i.goal_id
    WHERE i.sync_id IS NOT NULL
  `).all()

  const salary_plans = db.prepare(`
    SELECT sync_id as id, label, monthly_salary, effective_from, effective_to, is_active, notes,
           created_at, updated_at, deleted_at, device_id
    FROM salary_plans WHERE sync_id IS NOT NULL
  `).all()

  const salary_plan_items = db.prepare(`
    SELECT spi.sync_id as id, sp.sync_id as plan_id, spi.name, spi.amount, spi.category,
           spi.bank_or_provider, spi.sort_order, spi.created_at, spi.updated_at, spi.deleted_at, spi.device_id
    FROM salary_plan_items spi JOIN salary_plans sp ON sp.id = spi.plan_id
    WHERE spi.sync_id IS NOT NULL
  `).all()

  const profile = db.prepare(`
    SELECT sync_id as id, name, monthly_salary, salary_updated_at, date_of_birth, retirement_age,
           updated_at, device_id
    FROM profile WHERE sync_id IS NOT NULL LIMIT 1
  `).get() || null

  return { expenses, goals, goal_contributions, goal_investments, investments, salary_plans, salary_plan_items, profile }
}

export function buildSyncFile(db, deviceId) {
  return {
    version: SYNC_VERSION,
    last_modified: new Date().toISOString(),
    last_modified_by: deviceId,
    data: getSyncSnapshot(db),
  }
}

function newer(a, b) {
  const ta = a ? new Date(a).getTime() : 0
  const tb = b ? new Date(b).getTime() : 0
  return ta > tb
}

// Merges remote.data into local SQLite, last-write-wins per row by timestamp.
// Returns how many local rows were inserted/updated from the remote side.
export function applySyncMerge(db, remoteData, deviceId) {
  if (!remoteData) return { downloaded: 0 }
  let downloaded = 0

  const findGoal = db.prepare('SELECT id FROM goals WHERE sync_id = ?')
  const findInv  = db.prepare('SELECT id FROM investments WHERE sync_id = ?')
  const findPlan = db.prepare('SELECT id FROM salary_plans WHERE sync_id = ?')
  const findUser = db.prepare('SELECT id FROM users WHERE name = ? LIMIT 1')

  const tx = db.transaction(() => {
    // ── goals (no outgoing FK) ──────────────────────────────────────────────
    {
      const findLocal = db.prepare('SELECT id, updated_at FROM goals WHERE sync_id = ?')
      const insert = db.prepare(`
        INSERT INTO goals (sync_id, title, type, category, target_amount, current_amount, target_date,
          bank_or_provider, emoji, color, inflation_adjust, inflation_rate, monthly_emi, notes,
          is_achieved, achieved_at, created_at, updated_at, deleted_at, device_id)
        VALUES (@id, @title, @type, @category, @target_amount, @current_amount, @target_date,
          @bank_or_provider, @emoji, @color, @inflation_adjust, @inflation_rate, @monthly_emi, @notes,
          @is_achieved, @achieved_at, @created_at, @updated_at, @deleted_at, @device_id)
      `)
      const update = db.prepare(`
        UPDATE goals SET title=@title, type=@type, category=@category, target_amount=@target_amount,
          current_amount=@current_amount, target_date=@target_date, bank_or_provider=@bank_or_provider,
          emoji=@emoji, color=@color, inflation_adjust=@inflation_adjust, inflation_rate=@inflation_rate,
          monthly_emi=@monthly_emi, notes=@notes, is_achieved=@is_achieved, achieved_at=@achieved_at,
          updated_at=@updated_at, deleted_at=@deleted_at, device_id=@device_id
        WHERE sync_id=@id
      `)
      for (const raw of remoteData.goals || []) {
        const r = fillDefaults(raw, { notes: null, bank_or_provider: null, emoji: null, color: null,
          achieved_at: null, deleted_at: null, device_id: null, inflation_adjust: 0, inflation_rate: 6,
          monthly_emi: 0, is_achieved: 0, target_date: null })
        const local = findLocal.get(r.id)
        if (!local) { insert.run(r); downloaded++ }
        else if (newer(r.updated_at, local.updated_at)) { update.run(r); downloaded++ }
      }
    }

    // ── investments (FK: goal_id → goals.sync_id) ──────────────────────────
    {
      const findLocal = db.prepare('SELECT id, last_updated_at FROM investments WHERE sync_id = ?')
      const insert = db.prepare(`
        INSERT INTO investments (sync_id, name, type, provider, bank_or_amc, account_number,
          invested_amount, current_value, monthly_sip_amount, sip_frequency, start_date, maturity_date,
          goal_id, notes, units, purchase_price, scheme_code, interest_rate, ticker_symbol, exchange,
          purity, sip_last_applied_at, created_at, last_updated_at, deleted_at, device_id)
        VALUES (@id, @name, @type, @provider, @bank_or_amc, @account_number,
          @invested_amount, @current_value, @monthly_sip_amount, @sip_frequency, @start_date, @maturity_date,
          @goal_id_local, @notes, @units, @purchase_price, @scheme_code, @interest_rate, @ticker_symbol, @exchange,
          @purity, @sip_last_applied_at, @created_at, @updated_at, @deleted_at, @device_id)
      `)
      const update = db.prepare(`
        UPDATE investments SET name=@name, type=@type, provider=@provider, bank_or_amc=@bank_or_amc,
          account_number=@account_number, invested_amount=@invested_amount, current_value=@current_value,
          monthly_sip_amount=@monthly_sip_amount, sip_frequency=@sip_frequency, start_date=@start_date,
          maturity_date=@maturity_date, goal_id=@goal_id_local, notes=@notes, units=@units,
          purchase_price=@purchase_price, scheme_code=@scheme_code, interest_rate=@interest_rate,
          ticker_symbol=@ticker_symbol, exchange=@exchange, purity=@purity,
          sip_last_applied_at=@sip_last_applied_at, last_updated_at=@updated_at,
          deleted_at=@deleted_at, device_id=@device_id
        WHERE sync_id=@id
      `)
      for (const raw of remoteData.investments || []) {
        const r = fillDefaults(raw, { provider: null, bank_or_amc: null, account_number: null,
          invested_amount: 0, current_value: 0, monthly_sip_amount: 0, sip_frequency: 'monthly',
          start_date: null, maturity_date: null, goal_id: null, notes: null, units: 0, purchase_price: 0,
          scheme_code: null, interest_rate: 0, ticker_symbol: null, exchange: 'NSE', purity: '24K',
          sip_last_applied_at: null, deleted_at: null, device_id: null })
        r.goal_id_local = r.goal_id ? (findGoal.get(r.goal_id)?.id ?? null) : null
        const local = findLocal.get(r.id)
        if (!local) { insert.run(r); downloaded++ }
        else if (newer(r.updated_at, local.last_updated_at)) { update.run(r); downloaded++ }
      }
    }

    // ── goal_contributions (FK: goal_id → goals.sync_id) ───────────────────
    {
      const findLocal = db.prepare('SELECT id, updated_at FROM goal_contributions WHERE sync_id = ?')
      const insert = db.prepare(`
        INSERT INTO goal_contributions (sync_id, goal_id, amount, note, contributed_at,
          contribution_type, created_at, updated_at, deleted_at, device_id)
        VALUES (@id, @goal_id_local, @amount, @note, @contributed_at,
          @contribution_type, @created_at, @updated_at, @deleted_at, @device_id)
      `)
      const update = db.prepare(`
        UPDATE goal_contributions SET goal_id=@goal_id_local, amount=@amount, note=@note,
          contributed_at=@contributed_at, contribution_type=@contribution_type,
          updated_at=@updated_at, deleted_at=@deleted_at, device_id=@device_id
        WHERE sync_id=@id
      `)
      for (const raw of remoteData.goal_contributions || []) {
        const r = fillDefaults(raw, { note: null, contribution_type: 'manual', deleted_at: null, device_id: null })
        const goalLocal = findGoal.get(r.goal_id)
        if (!goalLocal) continue // parent goal not present locally yet — skip, will retry next sync
        r.goal_id_local = goalLocal.id
        const local = findLocal.get(r.id)
        if (!local) { insert.run(r); downloaded++ }
        else if (newer(r.updated_at, local.updated_at)) { update.run(r); downloaded++ }
      }
    }

    // ── goal_investments (FK: goal_id, investment_id → sync_id) ────────────
    {
      const findLocal = db.prepare('SELECT id, updated_at FROM goal_investments WHERE sync_id = ?')
      const insert = db.prepare(`
        INSERT INTO goal_investments (sync_id, goal_id, investment_id, created_at, updated_at, deleted_at, device_id)
        VALUES (@id, @goal_id_local, @investment_id_local, @created_at, @updated_at, @deleted_at, @device_id)
      `)
      const update = db.prepare(`
        UPDATE goal_investments SET goal_id=@goal_id_local, investment_id=@investment_id_local,
          updated_at=@updated_at, deleted_at=@deleted_at, device_id=@device_id
        WHERE sync_id=@id
      `)
      for (const raw of remoteData.goal_investments || []) {
        const r = fillDefaults(raw, { deleted_at: null, device_id: null, updated_at: raw.created_at })
        const goalLocal = findGoal.get(r.goal_id)
        const invLocal  = findInv.get(r.investment_id)
        if (!goalLocal || !invLocal) continue // one side not present locally yet — skip, retry next sync
        r.goal_id_local = goalLocal.id
        r.investment_id_local = invLocal.id
        const local = findLocal.get(r.id)
        if (!local) { try { insert.run(r); downloaded++ } catch {} } // UNIQUE(goal_id,investment_id) may already exist from a pre-sync link
        else if (newer(r.updated_at, local.updated_at)) { update.run(r); downloaded++ }
      }
    }

    // ── salary_plans (no outgoing FK) ───────────────────────────────────────
    {
      const findLocal = db.prepare('SELECT id, updated_at FROM salary_plans WHERE sync_id = ?')
      const insert = db.prepare(`
        INSERT INTO salary_plans (sync_id, label, monthly_salary, effective_from, effective_to,
          is_active, notes, created_at, updated_at, deleted_at, device_id)
        VALUES (@id, @label, @monthly_salary, @effective_from, @effective_to,
          @is_active, @notes, @created_at, @updated_at, @deleted_at, @device_id)
      `)
      const update = db.prepare(`
        UPDATE salary_plans SET label=@label, monthly_salary=@monthly_salary, effective_from=@effective_from,
          effective_to=@effective_to, is_active=@is_active, notes=@notes,
          updated_at=@updated_at, deleted_at=@deleted_at, device_id=@device_id
        WHERE sync_id=@id
      `)
      for (const raw of remoteData.salary_plans || []) {
        const r = fillDefaults(raw, { effective_to: null, is_active: 0, notes: null, deleted_at: null,
          device_id: null, updated_at: raw.created_at })
        const local = findLocal.get(r.id)
        if (!local) { insert.run(r); downloaded++ }
        else if (newer(r.updated_at, local.updated_at)) { update.run(r); downloaded++ }
      }
    }

    // ── salary_plan_items (FK: plan_id → salary_plans.sync_id) ─────────────
    {
      const findLocal = db.prepare('SELECT id, updated_at FROM salary_plan_items WHERE sync_id = ?')
      const insert = db.prepare(`
        INSERT INTO salary_plan_items (sync_id, plan_id, name, amount, category, bank_or_provider,
          sort_order, created_at, updated_at, deleted_at, device_id)
        VALUES (@id, @plan_id_local, @name, @amount, @category, @bank_or_provider,
          @sort_order, @created_at, @updated_at, @deleted_at, @device_id)
      `)
      const update = db.prepare(`
        UPDATE salary_plan_items SET plan_id=@plan_id_local, name=@name, amount=@amount, category=@category,
          bank_or_provider=@bank_or_provider, sort_order=@sort_order,
          updated_at=@updated_at, deleted_at=@deleted_at, device_id=@device_id
        WHERE sync_id=@id
      `)
      for (const raw of remoteData.salary_plan_items || []) {
        const r = fillDefaults(raw, { bank_or_provider: null, sort_order: 0, deleted_at: null,
          device_id: null, created_at: raw.updated_at, updated_at: raw.updated_at || raw.created_at })
        const planLocal = findPlan.get(r.plan_id)
        if (!planLocal) continue
        r.plan_id_local = planLocal.id
        const local = findLocal.get(r.id)
        if (!local) { insert.run(r); downloaded++ }
        else if (newer(r.updated_at, local.updated_at)) { update.run(r); downloaded++ }
      }
    }

    // ── expenses (logged_by resolved by user name, best-effort) ────────────
    {
      const findLocal = db.prepare('SELECT id, updated_at FROM expenses WHERE sync_id = ?')
      const insert = db.prepare(`
        INSERT INTO expenses (sync_id, amount, category, note, date, logged_by_user_id,
          created_at, updated_at, deleted_at, device_id)
        VALUES (@id, @amount, @category, @note, @date, @logged_by_user_id,
          @created_at, @updated_at, @deleted_at, @device_id)
      `)
      const update = db.prepare(`
        UPDATE expenses SET amount=@amount, category=@category, note=@note, date=@date,
          logged_by_user_id=@logged_by_user_id, updated_at=@updated_at, deleted_at=@deleted_at, device_id=@device_id
        WHERE sync_id=@id
      `)
      for (const raw of remoteData.expenses || []) {
        const r = fillDefaults(raw, { note: null, deleted_at: null, device_id: null,
          updated_at: raw.updated_at || raw.created_at })
        r.logged_by_user_id = r.logged_by_user_name ? (findUser.get(r.logged_by_user_name)?.id ?? null) : null
        const local = findLocal.get(r.id)
        if (!local) { insert.run(r); downloaded++ }
        else if (newer(r.updated_at, local.updated_at)) { update.run(r); downloaded++ }
      }
    }

    // ── profile (singleton — newest updated_at wins outright) ──────────────
    if (remoteData.profile) {
      const r = fillDefaults(remoteData.profile, { date_of_birth: null, retirement_age: 60, device_id: null })
      const local = db.prepare('SELECT id, sync_id, updated_at FROM profile LIMIT 1').get()
      if (!local) {
        db.prepare(`
          INSERT INTO profile (sync_id, name, monthly_salary, salary_updated_at, date_of_birth,
            retirement_age, updated_at, device_id)
          VALUES (@id, @name, @monthly_salary, @salary_updated_at, @date_of_birth, @retirement_age, @updated_at, @device_id)
        `).run(r)
        downloaded++
      } else if (newer(r.updated_at, local.updated_at)) {
        db.prepare(`
          UPDATE profile SET sync_id=@id, name=@name, monthly_salary=@monthly_salary,
            salary_updated_at=@salary_updated_at, date_of_birth=@date_of_birth, retirement_age=@retirement_age,
            updated_at=@updated_at, device_id=@device_id
          WHERE id=@local_id
        `).run({ ...r, local_id: local.id })
        downloaded++
      }
    }
  })
  tx()

  return { downloaded }
}
