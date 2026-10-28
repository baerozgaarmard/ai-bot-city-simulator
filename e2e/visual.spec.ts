import { test, expect } from '@playwright/test'
test('v2 city renders, follows, and the simulation actually progresses', async ({ page }) => {
  test.setTimeout(150000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('/')
  await expect(page.getByText('AI Bot City Simulator')).toBeVisible()
  await page.waitForTimeout(3000)
  await page.screenshot({ path: 'screenshots/v2-desktop.png' })
  // Follow Alice: select in registry, then Follow in City.
  await page.getByText('Alice').first().click()
  await page.getByText('Follow in City').click()
  await page.waitForTimeout(2000)
  await page.mouse.wheel(0, -600) // close zoom via the scene wheel handler
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'screenshots/v2-follow-close.png' })
  // Let the simulation run: 1 real second = 1 sim minute, so after ~40s
  // short activities (15-40 sim minutes) must complete and generate events.
  await page.waitForTimeout(40000)
  await page.screenshot({ path: 'screenshots/v2-after-40s.png' })
  const body = await page.textContent('body')
  expect(errors).toEqual([])
  expect(body).toContain('Events:')
  // Events counter must be > 0 (arrivals generate MOVEMENT events).
  expect(body).not.toMatch(/Events: 0 /)
  expect(body).not.toMatch(/Completed: 0/)
})
test('v2 mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  page.on('pageerror', (e) => { throw e })
  await page.goto('/')
  await expect(page.getByText('AI Bot City Simulator')).toBeVisible()
  await page.waitForTimeout(3000)
  await page.screenshot({ path: 'screenshots/v2-mobile.png' })
})
