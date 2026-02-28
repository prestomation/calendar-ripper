import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { createHash } from 'crypto'
import { join } from 'path'

const TEST_DIR = join(process.cwd(), 'output-test-inject')

// Reusable implementation of the inject logic (mirrors scripts/inject-sw-assets.mjs)
function injectSwAssets(outputDir) {
  const manifestRaw = readFileSync(join(outputDir, '.vite', 'manifest.json'), 'utf-8')
  const manifest = JSON.parse(manifestRaw)

  const assets = new Set()
  Object.values(manifest).forEach(entry => {
    if (entry.file) assets.add('./' + entry.file)
    if (entry.css) entry.css.forEach(f => assets.add('./' + f))
  })
  assets.add('./index.html')
  assets.add('./')

  const manifestHash = createHash('sha256').update(manifestRaw).digest('hex').slice(0, 8)

  let sw = readFileSync(join(outputDir, 'sw.js'), 'utf-8')
  sw = sw.replace('/* __APP_SHELL_URLS__ */[]', JSON.stringify([...assets]))
  sw = sw.replace('/* __APP_SHELL_HASH__ */', manifestHash)
  writeFileSync(join(outputDir, 'sw.js'), sw)

  return { assets: [...assets], manifestHash }
}

describe('inject-sw-assets', () => {
  beforeEach(() => {
    mkdirSync(join(TEST_DIR, '.vite'), { recursive: true })
  })

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('injects asset URLs and hash into sw.js', () => {
    const viteManifest = {
      'src/main.jsx': {
        file: 'assets/main-abc123.js',
        css: ['assets/main-def456.css'],
        isEntry: true,
      },
    }

    writeFileSync(
      join(TEST_DIR, '.vite', 'manifest.json'),
      JSON.stringify(viteManifest)
    )

    const swTemplate = [
      "const APP_SHELL_CACHE = 'app-shell-v/* __APP_SHELL_HASH__ */'",
      "const APP_SHELL_URLS = /* __APP_SHELL_URLS__ */[]",
    ].join('\n')
    writeFileSync(join(TEST_DIR, 'sw.js'), swTemplate)

    const { manifestHash } = injectSwAssets(TEST_DIR)
    const result = readFileSync(join(TEST_DIR, 'sw.js'), 'utf-8')

    // Verify hash is injected
    expect(result).toContain(`app-shell-v${manifestHash}`)
    expect(result).not.toContain('__APP_SHELL_HASH__')

    // Verify asset URLs are injected
    expect(result).toContain('./assets/main-abc123.js')
    expect(result).toContain('./assets/main-def456.css')
    expect(result).toContain('./index.html')
    expect(result).not.toContain('__APP_SHELL_URLS__')
  })

  it('deduplicates asset URLs', () => {
    const viteManifest = {
      'src/main.jsx': {
        file: 'assets/main-abc123.js',
        css: ['assets/shared-999.css'],
        isEntry: true,
      },
      'src/other.jsx': {
        file: 'assets/other-xyz789.js',
        css: ['assets/shared-999.css'],
      },
    }

    writeFileSync(
      join(TEST_DIR, '.vite', 'manifest.json'),
      JSON.stringify(viteManifest)
    )

    const swTemplate = "const APP_SHELL_URLS = /* __APP_SHELL_URLS__ */[]\n"
    writeFileSync(join(TEST_DIR, 'sw.js'), swTemplate)

    const { assets } = injectSwAssets(TEST_DIR)

    // shared-999.css should appear exactly once
    const sharedCount = assets.filter(u => u.includes('shared-999')).length
    expect(sharedCount).toBe(1)

    // All expected assets present
    expect(assets).toContain('./assets/main-abc123.js')
    expect(assets).toContain('./assets/other-xyz789.js')
    expect(assets).toContain('./assets/shared-999.css')
    expect(assets).toContain('./index.html')
    expect(assets).toContain('./')
  })

  it('produces a consistent hash for the same manifest', () => {
    const manifest1 = JSON.stringify({ 'a.js': { file: 'assets/a-111.js' } })
    const manifest2 = JSON.stringify({ 'a.js': { file: 'assets/a-111.js' } })

    const hash1 = createHash('sha256').update(manifest1).digest('hex').slice(0, 8)
    const hash2 = createHash('sha256').update(manifest2).digest('hex').slice(0, 8)

    expect(hash1).toBe(hash2)
    expect(hash1).toHaveLength(8)
  })

  it('produces different hashes for different manifests', () => {
    const manifest1 = JSON.stringify({ 'a.js': { file: 'assets/a-111.js' } })
    const manifest2 = JSON.stringify({ 'a.js': { file: 'assets/a-222.js' } })

    const hash1 = createHash('sha256').update(manifest1).digest('hex').slice(0, 8)
    const hash2 = createHash('sha256').update(manifest2).digest('hex').slice(0, 8)

    expect(hash1).not.toBe(hash2)
  })
})
