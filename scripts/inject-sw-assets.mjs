// Post-build script: reads Vite's build manifest and injects hashed asset URLs
// and a cache-version hash into the service worker file (output/sw.js).

import { readFileSync, writeFileSync } from 'fs'
import { createHash } from 'crypto'

const manifestRaw = readFileSync('output/.vite/manifest.json', 'utf-8')
const manifest = JSON.parse(manifestRaw)

const assets = new Set()

// Add JS entry files
Object.values(manifest).forEach(entry => {
  if (entry.file) assets.add('./' + entry.file)
  // Add CSS files referenced by entries
  if (entry.css) entry.css.forEach(f => assets.add('./' + f))
})

// Always include index.html and root path
assets.add('./index.html')
assets.add('./')

// Derive a short hash from the build manifest for cache versioning
const manifestHash = createHash('sha256').update(manifestRaw).digest('hex').slice(0, 8)

let sw = readFileSync('output/sw.js', 'utf-8')
sw = sw.replace('/* __APP_SHELL_URLS__ */[]', JSON.stringify([...assets]))
sw = sw.replace('/* __APP_SHELL_HASH__ */', manifestHash)
writeFileSync('output/sw.js', sw)

console.log(`Injected ${assets.size} app shell URLs into sw.js (cache hash: ${manifestHash})`)
