#!/usr/bin/env node
// better-sqlite3 needs a native rebuild matching whichever runtime will load
// it. Electron and plain Node use different ABI versions, so:
//   - Electron mode (npm run dev / build, this app's normal use) needs it
//     rebuilt for Electron's ABI — that's electron-rebuild, run by default.
//   - Anything that loads better-sqlite3 from plain `node` (src/server in
//     SQLite mode, scripts/migrate-sqlite-to-postgres.js) needs the stock
//     Node ABI build instead — set SKIP_ELECTRON_REBUILD=1 before `npm
//     install` for that (deploy.sh does this for the Hostinger production
//     install, which is Postgres-only and never touches better-sqlite3 at
//     runtime anyway, so skipping the Electron rebuild there is also just
//     a faster, less fragile install).
const { execSync } = require('child_process')

if (process.env.SKIP_ELECTRON_REBUILD === '1' || process.env.SKIP_ELECTRON_REBUILD === 'true') {
  console.log('SKIP_ELECTRON_REBUILD set — skipping electron-rebuild of better-sqlite3.')
  process.exit(0)
}

execSync('electron-rebuild -w better-sqlite3', { stdio: 'inherit' })
