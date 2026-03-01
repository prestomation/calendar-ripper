import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync } from 'fs'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-service-worker',
      writeBundle() {
        try {
          copyFileSync('src/sw.js', '../output/sw.js')
          copyFileSync('src/manifest.webmanifest', '../output/manifest.webmanifest')
        } catch (err) {
          console.error('copy-service-worker plugin failed:', err.message)
          throw err
        }
      }
    }
  ],
  base: './',
  build: {
    outDir: '../output',
    manifest: true,
  },
  server: {
    fs: {
      allow: ['..']
    }
  },
  publicDir: '../output'
})
