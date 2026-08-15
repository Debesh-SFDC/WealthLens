import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Plain `vite build` (unlike `electron-vite build`) does not read
// electron.vite.config.js, so it fell back to the repo-root index.html
// (the OAuth redirect stub) instead of src/renderer/index.html — hence
// the 1.26KB output with no JS bundle. This config points it at the
// actual renderer app.
export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'src/renderer'),
  base: '/',
  // root is src/renderer, but .env.web lives at the repo root — without
  // this, import.meta.env.VITE_APP_MODE etc. would be undefined in the build.
  envDir: resolve(__dirname),
  build: {
    outDir: resolve(__dirname, 'dist-web'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/renderer/index.html'),
    },
  },
})
