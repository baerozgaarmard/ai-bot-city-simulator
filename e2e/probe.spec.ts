import { test, expect, type Page, type Dialog } from '@playwright/test'

// Wait for the next alert/confirm dialog, accepting it the moment it
// fires, and return its message. A fixed waitForTimeout after the click
// is racy — the save alert only fires after the async IndexedDB write,
// and on a loaded machine (parallel workers, cold dev server) the click
// can land while the main thread is still building Phaser textures, so
// the alert arrived after the sleep and the test failed with no dialog
// seen, even though the save had worked. And waitForEvent('dialog')
// alone deadlocks: Playwright holds the click action until the dialog
// is handled, but nothing handles it until the click returns — the
// IndexedDB-failure test hung the click for the full 30s that way,
// because its failure alert fires synchronously with the click.
function waitForDialog(page: Page): Promise<string> {
  return new Promise<string>((resolve) => {
    const handler = (d: Dialog) => { page.off('dialog', handler); d.accept(); resolve(d.message()) }
    page.on('dialog', handler)
  })
}

test('save/load round-trip keeps the world and add-agent validation works', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto('/')
  await expect(page.getByText('Alice').first()).toBeVisible()

  // Add an agent (inputs inside the dialog, not the registry search box)
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
  const saveDialog = waitForDialog(page)
  await page.getByRole('button', { name: 'Save' }).click()
  await saveDialog
  const loadDialog = waitForDialog(page)
  await page.getByRole('button', { name: 'Load' }).click()
  await loadDialog
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
  const dialogSeen = waitForDialog(page)
  await page.getByRole('button', { name: 'Save' }).click()
  expect(await dialogSeen).toBe('World saved locally (IndexedDB).')
  expect(errors).toEqual([])
})

test('save reports the failure when IndexedDB is unavailable', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  // Regression: doSave awaited saveWorld with no error handling, so when
  // IndexedDB itself failed (blocked storage, private mode) the promise
  // rejected unhandled, no confirmation appeared, and the user clicked
  // Save and nothing happened — the same silent failure the localStorage
  // fix addressed for the bookmark, but for the storage backend itself.
  // Load already alerts on failure; Save must too.
  await page.addInitScript(() => {
    window.indexedDB.open = () => { throw new Error('IndexedDB blocked') }
  })
  await page.goto('/')
  await expect(page.getByText('Alice').first()).toBeVisible()
  const dialogSeen = waitForDialog(page)
  await page.getByRole('button', { name: 'Save' }).click()
  expect(await dialogSeen).toMatch(/could not be saved/i)
  expect(errors).toEqual([])
})

test('loading a save that drops agents frees their generated textures', async ({ page }) => {
  test.setTimeout(180000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  // Regression: the ghost-sprite prune destroyed the sprite, shadow,
  // ring and label of an agent that no longer exists after a load, but
  // never removed the 16 textures makeSpriteTextures registered for it
  // (4 dirs x 4 frames) — destroying a sprite does not unregister its
  // textures from Phaser's Texture Manager. Ten add-agent + load-old-
  // save cycles grew agent textures 384 -> 544, leaking GPU texture
  // memory for the whole session. The prune loop now removes them.
  // The live scene is reached through the app's own module graph: the
  // dev server serves /src modules from the same origin, so a dynamic
  // import returns the same module instance the app uses.
  const agentTexCount = () => page.evaluate(async () => {
    const m = await import('/src/city/PhaserScene.ts')
    const scene: any = m.getScene()
    return scene.textures.getTextureKeys().filter((k: string) => k.startsWith('agent-')).length
  })
  await page.goto('/')
  await expect(page.getByText('Alice').first()).toBeVisible()
  await page.waitForTimeout(2000) // let the scene create and run frames
  let d = waitForDialog(page)
  await page.getByRole('button', { name: 'Save' }).click()
  await d // baseline save: the 24 seeded agents only
  const before = await agentTexCount()
  expect(before).toBe(24 * 16)
  for (let i = 0; i < 10; i++) {
    await page.getByRole('button', { name: 'Add Agent' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('input').first().fill(`Leak${i}`)
    await page.getByRole('button', { name: 'Create Agent' }).click()
    await expect(page.getByText(`Leak${i}`).first()).toBeVisible()
    await page.waitForTimeout(500) // let a frame run so ensureAgent creates the textures
    d = waitForDialog(page)
    await page.getByRole('button', { name: 'Load' }).click()
    await d
    await expect(page.getByText(`Leak${i}`).first()).toBeHidden({ timeout: 5000 })
  }
  expect(await agentTexCount()).toBe(before)
  expect(errors).toEqual([])
})
