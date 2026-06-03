import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages uses /References-Validation/, Vercel uses /
  base: process.env.GITHUB_ACTIONS ? '/References-Validation/' : '/',
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
  }
})
