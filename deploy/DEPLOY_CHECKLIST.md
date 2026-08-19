# Lifelog Hostinger Deployment Checklist

## One-time setup on KVM1:
- [ ] Create wealthlens_db in PostgreSQL
- [ ] Run scripts/setup-postgres.sql: `psql $DATABASE_URL < scripts/setup-postgres.sql`
- [ ] Run migration script **locally** with the local SQLite file (needs network access to
      Postgres, e.g. via an SSH tunnel or a temporarily public DATABASE_URL):
      1. `npm run rebuild:node` — better-sqlite3 is normally built for Electron's ABI; the
         migration script runs under plain Node, so it needs the stock Node build first.
      2. `npm run migrate -- --sqlite ~/Library/Application\ Support/WealthLens/wealthlens.db --database-url $DATABASE_URL`
      3. `npm install` afterward to restore the Electron build before running `npm run dev` again.
- [ ] Copy deploy/nginx.conf to /etc/nginx/sites-available/wealthlens
- [ ] ln -s /etc/nginx/sites-available/wealthlens /etc/nginx/sites-enabled/
- [ ] nginx -t && systemctl reload nginx
- [ ] certbot --nginx -d wealthlens.arogyahms.in
- [ ] Copy deploy/ecosystem.config.js to server (/var/www/wealthlens/deploy/ecosystem.config.js)
- [ ] Copy .env.web to /var/www/wealthlens/.env.web with real DATABASE_URL, JWT_SECRET, VITE_GOOGLE_CLIENT_ID
- [ ] pm2 start deploy/ecosystem.config.js --env production
- [ ] pm2 save && pm2 startup

## Each deploy after that:
- [ ] git push from local
- [ ] SSH into KVM1: bash deploy/deploy.sh
- [ ] Verify https://wealthlens.arogyahms.in/api/health

## Notes
- The Express server (src/server/) reads `.env.web` in production (NODE_ENV=production or APP_MODE=web)
  and `.env.electron` locally — see src/server/db.js and src/server/index.js for mode resolution.
- Real `.env.electron` / `.env.web` files are gitignored; only the `.example` versions are committed.
  Create the real files on the server from the `.example` templates before first deploy.
- `src/server/routes/sync.js` implements a simplified web-mode sync (server DB is the shared store —
  no Google Drive round-trip). It currently covers profile, goals, investments, salary_plans,
  salary_plan_items, expenses; goal_investments/goal_contributions merging was left for a follow-up.
