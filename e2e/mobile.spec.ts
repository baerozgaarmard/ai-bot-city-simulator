import { test, expect } from '@playwright/test'
test.use({ viewport: { width: 390, height: 844 } })
test('mobile shell renders, panels start collapsed, city loads', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => { errors.push(String(e)) })
  await page.goto('/')
  await expect(page.getByText('AI Bot City Simulator')).toBeVisible()
  // Panels start collapsed on a phone: reopen buttons, not the registry panel.
  await expect(page.getByRole('button', { name: 'Show agent registry panel' })).toBeVisible()
  await expect(page.getByText('Agent Registry')).toHaveCount(0)
  // City loads (canvas appears) or is still showing its loading indicator — never a blank shell.
  await expect(page.locator('canvas, [role="status"]').first()).toBeVisible({ timeout: 30000 })
  expect(errors).toEqual([])
})
