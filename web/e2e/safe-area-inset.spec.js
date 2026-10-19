import { test, expect } from '@playwright/test'
import { installDataMocks } from './mock-routes.js'

// Standalone PWA (added to iPhone Home Screen) draws the black-translucent
// status bar over the page content (apple-mobile-web-app-status-bar-style in
// index.html), so on a notched/Dynamic-Island phone the top bar must reserve
// env(safe-area-inset-top) or its buttons render underneath the status bar
// and are unreachable until the page is scrolled — issue #1536.
//
// Chromium's CDP exposes Emulation.setSafeAreaInsetsOverride to simulate that
// inset in a headless browser (there's no way to get a real notch otherwise);
// Firefox has no equivalent, so this only runs under chromium.
test.skip(({ browserName }) => browserName === 'firefox', 'safe-area-inset override is Chromium-only (CDP)')
test.use({ viewport: { width: 430, height: 932 }, hasTouch: true, isMobile: true })

// iPhone 14 Pro Max Dynamic Island / home-indicator safe areas.
const TOP_INSET = 59
const BOTTOM_INSET = 34

test('top bar reserves the Dynamic Island safe area in standalone mode', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setSafeAreaInsetsOverride', {
    insets: { top: TOP_INSET, bottom: BOTTOM_INSET, left: 0, right: 0 },
  })

  await installDataMocks(page)
  await page.goto('/')
  await expect(page.getByText('Neumos')).toBeVisible()

  // The rule under test lives on `.a-top` (the grid row wrapping <TopBar/>);
  // its computed padding-top must equal the emulated inset, not just be
  // non-zero — without the CSS rule this would compute to 0px even with the
  // inset override active, since nothing in the cascade reads the env() var.
  const paddingTop = await page.locator('.a-top').evaluate((el) => getComputedStyle(el).paddingTop)
  expect(paddingTop).toBe(`${TOP_INSET}px`)

  // The topbar's own controls must render entirely below the inset so they're
  // reachable — not merely padded on a container that doesn't push them down.
  const helpButton = page.getByRole('button', { name: 'How it works' })
  const box = await helpButton.boundingBox()
  expect(box.y).toBeGreaterThanOrEqual(TOP_INSET)

  await page.screenshot({ path: 'e2e/screenshots/safe-area-inset-top.png' })
})
