import { test, expect } from '@playwright/test'

test('save/load round-trip keeps the world and add-agent validation works', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto('/')
  await expect(page.getByText('Alice').first()).toBeVisible()

  // Add an agent (inputs inside the dialog, not the registry search box)
  page.on('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Add Agent' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('input').first().fill('Zoe Probe')
  await page.getByRole('button', { name: 'Create Agent' }).click()
  // Regression: the new agent must appear in the registry on the next
  // render, not only after the next sim-minute tick (2-5s later in
  // headless runs) — the registry memo used to key only on ui.tick,
  // which an add does not advance.
  await expect(page.getByText('Zoe Probe').first()).toBeVisible({ timeout: 1000 })

  // Duplicate name must be rejected
  await page.getByRole('button', { name: 'Add Agent' }).click()
  await dialog.locator('input').first().fill('zoe probe')
  await page.getByRole('button', { name: 'Create Agent' }).click()
  await expect(page.getByText('already exists')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()

  // Save then Load
  await page.getByRole('button', { name: 'Save' }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Load' }).click()
  await page.waitForTimeout(500)
  await expect(page.getByText('Zoe Probe').first()).toBeVisible()

  // Pause button toggles
  await page.getByRole('button', { name: 'Pause or resume' }).click()
  await page.getByRole('button', { name: 'Pause or resume' }).click()

  expect(errors).toEqual([])
})

test('reset agent button restarts the selected agent', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('/')
  await expect(page.getByText('Alice').first()).toBeVisible()
  await page.getByText('Alice').first().click()
  await expect(page.getByRole('button', { name: 'Reset Agent' })).toBeVisible()
  page.on('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Reset Agent' }).click()
  await page.waitForTimeout(1500)
  await expect(page.getByText('Alice').first()).toBeVisible()
  expect(errors).toEqual([])
})

test('save still works when localStorage is unavailable', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  // Regression: saveWorld wrote a tick bookmark to localStorage that
  // nothing ever reads. When localStorage is blocked (disabled cookies /
  // storage-restricted browser) setItem throws AFTER the IndexedDB write
  // already succeeded, so doSave rejects, no confirmation appears, and
  // the user clicks Save and nothing happens — while the save actually
  // worked. Saving must not depend on localStorage.
  await page.addInitScript(() => {
    window.localStorage.setItem = () => { throw new Error('localStorage blocked') }
  })
  await page.goto('/')
  await expect(page.getByText('Alice').first()).toBeVisible()
  let dialogText = ''
  page.on('dialog', (d) => { dialogText = d.message(); d.accept() })
  await page.getByRole('button', { name: 'Save' }).click()
  await page.waitForTimeout(500)
  expect(dialogText).toBe('World saved locally (IndexedDB).')
  expect(errors).toEqual([])
})
