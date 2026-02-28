import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync } from 'fs'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-service-worker',
      writeBundle() {
        copyFileSync('src/sw.js', '../output/sw.js')
        copyFileSync('src/manifest.webmanifest', '../output/manifest.webmanifest')
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
