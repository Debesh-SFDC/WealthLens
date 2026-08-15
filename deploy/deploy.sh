#!/bin/bash
set -e
echo "Deploying WealthLens to Hostinger..."
cd /var/www/wealthlens
git pull origin main
# Web mode is Postgres-only — skip the Electron-ABI rebuild of better-sqlite3
# (unneeded here, and electron-rebuild would need Electron's build headers).
SKIP_ELECTRON_REBUILD=1 npm install --production
npm run build:web
mkdir -p /var/www/wealthlens/public
cp -r dist-web/* /var/www/wealthlens/public/

echo "Running DB migrations..."
# DATABASE_URL lives in .env.web (see DEPLOY_CHECKLIST.md) — source it rather
# than hardcoding, so this keeps working if the connection string ever changes.
set -a
source .env.web
set +a
psql "$DATABASE_URL" < scripts/setup-postgres.sql
echo "Migrations done."

pm2 restart wealthlens-server || pm2 start deploy/ecosystem.config.js --env production
echo "Deploy complete!"
