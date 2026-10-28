import { test, expect } from '@playwright/test'
test('v3 desktop + follow + close zoom', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('/')
  await expect(page.getByText('AI Bot City Simulator')).toBeVisible()
  await page.waitForTimeout(4000)
  await page.screenshot({ path: 'screenshots/v3-desktop.png' })
  await page.getByText('Alice').first().click()
  await page.getByText('Follow in City').click()
  await page.waitForTimeout(1500)
  // Wheel over the canvas itself (not over the panel buttons).
  const box = await page.locator('[aria-label="City viewport"] canvas').first().boundingBox()
  if (box) { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.wheel(0, -900) }
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'screenshots/v3-follow-close.png' })
  expect(errors).toEqual([])
})
test('v3 mobile fresh viewport', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByText('AI Bot City Simulator')).toBeVisible()
  await page.waitForTimeout(4000)
  await page.screenshot({ path: 'screenshots/v3-mobile.png' })
  expect(errors).toEqual([])
})
