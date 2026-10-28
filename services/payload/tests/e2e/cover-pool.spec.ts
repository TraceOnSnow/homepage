import { expect, test } from '@playwright/test'
import sharp from 'sharp'

test('default cover pool uses native upload/selection and preserves defaults until explicit save', async ({ page, request }) => {
  await page.goto('/admin')
  await page.locator('#field-email').fill('owner@example.test')
  await page.locator('#field-password').fill('browser-test-password-123')
  if (await page.locator('#field-confirm-password').count()) {
    const ready = page.waitForResponse(response => response.url().endsWith('/admin/create-first-user') && response.request().method() === 'POST' && response.ok())
    await page.locator('#field-confirm-password').fill('browser-test-password-123')
    await page.locator('#field-confirm-password').blur(); await ready
    await page.getByRole('button', { name: /^(Create|创建)$/ }).click()
  } else await page.getByRole('button', { name: /^(Login|Log in|登录)$/ }).click()
  await expect(page).toHaveURL(/\/admin$/)
  const login = await request.post('/api/users/login', { data: { email: 'owner@example.test', password: 'browser-test-password-123' } })
  expect(login.ok()).toBe(true)
  const headers = { Authorization: `JWT ${(await login.json()).token}` }
  const initial = await (await request.get('/api/site-covers')).json()
  // Payload keeps the collapsed navigation in the DOM behind the dashboard.
  // Open it through the native toggle before following the custom nav link.
  const openMenu = page.getByRole('button', { name: /Open Menu|打开.*菜单/ }).first()
  if (await openMenu.isVisible()) await openMenu.click()
  await page.getByRole('link', { name: /默认封面池|Default covers/, exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/site-covers$/)
  const closeMenu = page.getByRole('button', { name: /Close Menu|关闭.*菜单/ }).first()
  if (await closeMenu.isVisible()) await closeMenu.click()
  await expect(page.getByRole('heading', { name: '默认封面池', exact: true })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('已读取封面池')
  await expect(page.getByLabel('使用默认图 1', { exact: true })).toBeChecked()
  await page.getByLabel('使用默认图 1', { exact: true }).uncheck()
  expect((await (await request.get('/api/site-covers')).json()).revision).toBe(initial.revision)
  await page.getByRole('button', { name: '保存封面池', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('已保存并核对')
  const subset = await (await request.get('/api/site-covers')).json()
  expect(subset.covers).not.toContain('/img/cover/1.webp')
  expect(subset.covers).toContain('/img/cover/2.webp')

  const image = await sharp({ create: { width: 48, height: 32, channels: 3, background: '#5588aa' } }).png().toBuffer()
  await page.getByRole('button', { name: '上传新图片', exact: true }).click()
  const drawer = page.locator('.doc-drawer:visible').last()
  await drawer.locator('input[type="file"]').setInputFiles({ name: 'pool-native-upload.png', mimeType: 'image/png', buffer: image })
  await drawer.locator('#field-alt').fill('封面池原生上传验收')
  const uploaded = page.waitForResponse(response => new URL(response.url()).pathname === '/api/media' && response.request().method() === 'POST' && response.ok())
  await drawer.getByRole('button', { name: /^(Save|保存)$/ }).click()
  const media = (await (await uploaded).json()).doc
  await expect(drawer).toBeHidden()
  const selected = page.locator(`[data-media-id="${media.id}"]`)
  await expect(selected).toBeVisible()
  await expect(selected.locator('img')).toHaveJSProperty('naturalWidth', 48)
  await page.getByRole('button', { name: '保存封面池', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('已保存并核对')
  let saved = await (await request.get('/api/site-covers')).json()
  expect(saved.mediaIds).toContain(media.id)
  await page.reload()
  await expect(selected).toBeVisible()

  // A stale browser selection cannot overwrite a concurrent administrative change.
  const concurrent = await request.patch('/api/site-covers', { headers, data: { revision: saved.revision, includeBuiltIn: true, mediaIds: [], builtInIds: [2, 3] } })
  expect(concurrent.ok()).toBe(true)
  await page.getByLabel('使用默认图 4', { exact: true }).uncheck()
  await page.getByRole('button', { name: '保存封面池', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('其他操作更新')
  await expect(selected).toBeVisible()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: '重新读取', exact: true }).click()
  await expect(selected).toHaveCount(0)
  await expect(page.getByLabel('使用默认图 2', { exact: true })).toBeChecked()
  await expect(page.getByLabel('使用默认图 4', { exact: true })).not.toBeChecked()

  // Selecting a native library item again does not create a second upload.
  await page.getByRole('button', { name: '选择已有图片', exact: true }).click()
  const mediaList = page.locator('.list-drawer:visible')
  await mediaList.getByText('pool-native-upload.png', { exact: true }).click()
  await expect(mediaList).toBeHidden()
  await expect(selected).toBeVisible()
  await selected.getByRole('checkbox').uncheck()
  await expect(selected).toHaveCount(0)
  expect((await request.get(`/api/media/${media.id}`)).ok()).toBe(true)
  saved = await (await request.get('/api/site-covers')).json()
  const restored = await request.patch('/api/site-covers', { headers, data: { revision: saved.revision,
    includeBuiltIn: initial.includeBuiltIn, mediaIds: initial.mediaIds, ...(initial.builtInIds ? { builtInIds: initial.builtInIds } : {}) } })
  expect(restored.ok()).toBe(true)
})
