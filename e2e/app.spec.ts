import { test, expect } from '@playwright/test'
test('city loads and registry shows agents', async ({ page }) => {
  page.on('pageerror', (e) => { throw e })
  await page.goto('/')
  await expect(page.getByText('AI Bot City Simulator')).toBeVisible()
  await expect(page.getByText('Alice').first()).toBeVisible()
  await expect(page.getByText('Agent Registry')).toBeVisible()
})
