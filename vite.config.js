import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // GitHub Pages project sites are served from /<repo>/; the deploy workflow
  // sets VITE_BASE. Local dev and root-domain hosts stay on '/'.
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
})
