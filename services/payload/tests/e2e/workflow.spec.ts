import { expect, test } from '@playwright/test'

test('admin searches all eight providers, saves Works, and exposes only public authenticated content', async ({ page, request, playwright }) => {
  expect((await request.get('/api/metadata/games?q=TUNIC')).status()).toBe(401)
  expect((await request.get('/api/metadata/search?type=book&q=三体')).status()).toBe(401)
  expect((await request.get('/api/metadata/details?type=book&q=三体&provider=weread&id=1')).status()).toBe(401)
  await page.goto('/admin')
  await page.locator('#field-email').fill('owner@example.test')
  await page.locator('#field-password').fill('browser-test-password-123')
  const ready = page.waitForResponse(response => response.url().endsWith('/admin/create-first-user') && response.request().method() === 'POST' && response.ok())
  await page.locator('#field-confirm-password').fill('browser-test-password-123')
  await page.locator('#field-confirm-password').blur()
  await ready
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page).toHaveURL(/\/admin$/)
  await page.goto('/admin/collections/works/create')
  // Only external metadata search/detail responses are mocked. Form rendering, save, authentication,
  // relationships, database and public rendering all use the real application.
  await page.route('**/api/metadata/search?type=game&q=TUNIC', route => route.fulfill({ json: {
    candidates: [{ type: 'game', provider: 'igdb', externalId: '12', title: 'TUNIC', aliases: ['TUNIC', '小狐狸'], creators: ['Andrew Shouldice'], platforms: ['PC'], releaseDate: '2022-03-16T00:00:00.000Z', description: 'An adventure game.', source: { provider: 'igdb', externalId: '12', url: 'https://www.igdb.com/games/tunic', fetchedAt: '2026-09-29T00:00:00.000Z' } }],
    providers: [{ provider: 'igdb', state: 'ok' }, { provider: 'rawg', state: 'unavailable', message: '服务端尚未配置凭据。' }],
  } }))
  await page.route('**/api/metadata/details?**', route => route.fulfill({ status: 503, json: { error: 'Provider unavailable' } }))
  await page.getByLabel('Search games', { exact: true }).fill('TUNIC')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.getByRole('button', { name: 'Select TUNIC', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'filled basic search metadata' })).toBeVisible()
  await expect(page.locator('#field-title')).toHaveValue('TUNIC')
  await page.locator('#field-rating').fill('9.5')
  await page.locator('#field-note').fill('A memorable adventure.')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/collections\/works\/\d+$/)
  const response = await request.get('/api/works?where[slug][equals]=tunic')
  const work = (await response.json()).docs[0]
  expect(work.rating).toBe(9.5)
  expect(work.aliases).toContain('小狐狸')
  expect(work.sources[0].externalId).toBe('12')
  expect(work.creators).toEqual(['Andrew Shouldice'])
  const login = await request.post('/api/users/login', { data: { email: 'owner@example.test', password: 'browser-test-password-123' } })
  expect(login.ok()).toBe(true)
  const apiToken = (await login.json()).token

  const anonymous = await playwright.request.newContext()
  try {
    const publicResponse = await anonymous.get('/api/works?where[slug][equals]=tunic')
    expect((await publicResponse.json()).docs[0].rating).toBe(9.5)
    expect((await anonymous.post('/api/works', { data: { title: 'Unauthorized', type: 'game' } })).status()).toBe(403)
    expect((await anonymous.get('/api/users')).status()).toBe(403)
    expect((await (await anonymous.get('/api/posts')).json()).totalDocs).toBe(0)
    expect((await anonymous.get('/api/projects')).status()).toBe(404)
    expect((await anonymous.get('/works/tunic')).status()).toBe(404)
  } finally { await anonymous.dispose() }

  await page.goto('/admin/account')
  await page.locator('#language-select').fill('中文')
  await page.getByRole('option', { name: '中文 (简体)', exact: true }).click()
  await expect(page.locator('label[for="language-select"]')).toHaveText('语言')
  await page.goto('/admin/collections/works/create')
  await expect(page.getByLabel('搜索游戏', { exact: true })).toBeVisible()
  await expect(page.locator('label[for="field-title"]')).toContainText('标题')
  await page.reload()
  await expect(page.getByLabel('搜索游戏', { exact: true })).toBeVisible()
  const examples = [
    { type: 'game', label: '游戏', provider: 'rawg', title: 'RAWG Example', id: 'rawg-1' },
    { type: 'book', label: '书籍', provider: 'weread', title: '三体', id: 'wr-1' },
    { type: 'book', label: '书籍', provider: 'google-books', title: 'Google Book', id: 'gb-1' },
    { type: 'book', label: '书籍', provider: 'open-library', title: 'Library Book', id: 'OL1W' },
    { type: 'movie', label: '电影', provider: 'tmdb', title: '星际穿越', id: 'movie:157336' },
    { type: 'tv', label: '电视剧', provider: 'tmdb', title: 'TV Example', id: 'tv:1' },
    { type: 'anime', label: '动画', provider: 'bangumi', title: '葬送的芙莉莲', id: '1' },
    { type: 'manga', label: '漫画', provider: 'bangumi', title: 'Manga Example', id: '2' },
    { type: 'boardgame', label: '桌游', provider: 'bgg', title: 'Catan', id: '13' },
    { type: 'comic', label: '美漫', provider: 'google-books', title: 'Comic Example', id: 'gb-2' },
  ]
  const fixture = (example: typeof examples[number]) => ({ provider: example.provider, type: example.type, externalId: example.id, title: example.title, aliases: [example.title], creators: ['Creator'], platforms: [], source: { provider: example.provider, externalId: example.id } })
  await page.route('**/api/metadata/search?**', route => {
    const q = new URL(route.request().url()).searchParams.get('q')
    const example = examples.find(example => example.title === q)!
    return route.fulfill({ json: { candidates: [fixture(example)], providers: [{ provider: example.provider, state: 'ok' }] } })
  })
  await page.route('**/api/metadata/details?**', route => {
    const q = new URL(route.request().url()).searchParams.get('q')
    const example = examples.find(example => example.title === q)!
    return route.fulfill({ json: { candidate: { ...fixture(example), description: 'Detailed metadata', coverUrl: 'https://example.test/cover.png', releaseDate: '2024-01-02T00:00:00.000Z' }, state: 'ok' } })
  })
  for (const example of examples) {
    await page.goto('/admin/collections/works/create')
    await page.locator('#field-type').click()
    await page.getByRole('option', { name: example.label, exact: true }).click()
    await page.locator('#metadata-search').fill(example.title)
    await page.getByRole('button', { name: '搜索', exact: true }).click()
    await page.getByRole('button', { name: `选择 ${example.title}`, exact: true }).click()
    await expect(page.locator('#field-title')).toHaveValue(example.title)
    await expect(page.locator('#field-coverUrl')).toHaveValue('https://example.test/cover.png')
    await expect(page.locator('#field-description')).toHaveValue('Detailed metadata')
    await page.locator('#field-rating').fill('8')
    await page.locator('#field-note').fill('My own reaction')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/collections\/works\/\d+$/)
    const documents = (await (await request.get(`/api/works?where[title][equals]=${encodeURIComponent(example.title)}`)).json()).docs
    const saved = documents[0]
    expect(saved.type).toBe(example.type)
    expect(saved.sources[0].externalId).toBe(example.id)
    expect(saved.rating).toBe(8)
    expect(saved.note).toBe('My own reaction')
    expect(saved.coverUrl).toBe('https://example.test/cover.png')
    const anonymous = await playwright.request.newContext()
    try {
      expect((await (await anonymous.get(`/api/works/${saved.id}`)).json()).title).toBe(example.title)
      expect((await anonymous.patch(`/api/works/${saved.id}`, { data: { visibility: 'private' } })).status()).toBe(403)
      const hidden = await request.patch(`/api/works/${saved.id}`, { headers: { Authorization: `JWT ${apiToken}` }, data: { visibility: 'private' } })
      expect(hidden.ok()).toBe(true)
      expect((await anonymous.get(`/api/works/${saved.id}`)).status()).toBe(404)
      expect((await (await anonymous.get(`/api/works?where[id][equals]=${saved.id}`)).json()).totalDocs).toBe(0)
    } finally { await anonymous.dispose() }

  }

  await page.goto('/admin/collections/posts/create')
  await page.locator('#field-title').fill('Browser Markdown article')
  await page.locator('#field-markdown').fill('## Browser source\n\n++Preserved Markdown++')
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/collections\/posts\/\d+$/)
  const postID = page.url().split('/').at(-1)!
  const publicClient = await playwright.request.newContext()
  try {
    expect((await publicClient.get('/api/content/posts')).status()).toBe(401)
    expect((await publicClient.get(`/api/posts/${postID}`)).status()).toBe(404)
    await page.getByRole('button', { name: /^发布(?:修改)?$/ }).click()
    await expect.poll(async () => (await publicClient.get(`/api/posts/${postID}`)).status()).toBe(200)
    const published = await (await publicClient.get(`/api/posts/${postID}`)).json()
    expect(published.link).toBe('browser-markdown-article')
    expect(published.markdown).toBe('## Browser source\n\n++Preserved Markdown++')
    await page.goto('/admin/collections/works/create')
    await page.locator('#field-title').fill('Browser linked work')
    await page.locator('#field-article').click()
    await page.getByRole('option', { name: 'Browser Markdown article', exact: true }).click()
    await expect(page.locator('#field-note')).toHaveAttribute('placeholder', 'Browser Markdown article')
    await expect(page.locator('#field-note')).toHaveValue('')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/collections\/works\/\d+$/)
    const workID = page.url().split('/').at(-1)!
    const linked = await (await publicClient.get(`/api/works/${workID}`)).json()
    expect(linked.article.id).toBe(Number(postID))
    expect(linked.note || '').toBe('')
    await page.locator('#field-note').fill('Personal reaction stays mine')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    const changed = await request.patch(`/api/posts/${postID}`, { headers: { Authorization: `JWT ${apiToken}` }, data: { title: 'Renamed article' } })
    expect(changed.ok()).toBe(true)
    await page.reload()
    await expect(page.locator('#field-note')).toHaveAttribute('placeholder', 'Renamed article')
    const protectedPost = await request.patch(`/api/posts/${postID}`, { headers: { Authorization: `JWT ${apiToken}` }, data: { frontmatter: { password: 'test-only' } } })
    expect(protectedPost.ok()).toBe(true)
    expect((await publicClient.get(`/api/posts/${postID}`)).status()).toBe(404)
    const snapshot = await publicClient.get('/api/content/posts', { headers: { Authorization: 'Bearer browser-read-only-build-token-at-least-32-characters' } })
    expect(snapshot.ok()).toBe(true)
    expect((await snapshot.json()).docs.find((post: { id: number }) => post.id === Number(postID)).markdown).toBe('## Browser source\n\n++Preserved Markdown++')
    await expect(page.locator('#field-note')).toHaveValue('Personal reaction stays mine')
    await page.locator('#field-note').fill('')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await page.reload()
    await expect(page.locator('#field-note')).toHaveValue('')
    await expect(page.locator('#field-note')).toHaveAttribute('placeholder', 'Renamed article')

    await page.goto('/admin/collections/works/create')
    await page.locator('#field-title').fill('Work with inline article')
    await page.locator('#article-add-new button').click()
    const drawer = () => page.locator('.doc-drawer:visible').last()
    await drawer().locator('#field-title').fill('Inline created article')
    await drawer().locator('#field-markdown').fill('Plain text is valid Markdown.')
    await drawer().getByRole('button', { name: /^发布(?:修改)?$/ }).click()
    if (await drawer().isVisible()) await drawer().getByRole('button', { name: '关闭', exact: true }).first().click()
    await expect(page.locator('#field-note')).toHaveAttribute('placeholder', 'Inline created article')
    await page.locator('#field-note').fill('Do not overwrite this reaction')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/collections\/works\/\d+$/)
    await page.getByRole('button', { name: '编辑 Inline created article', exact: true }).click()
    await drawer().locator('#field-title').fill('Inline renamed article')
    await drawer().getByRole('button', { name: /^发布(?:修改)?$/ }).click()
    if (await drawer().isVisible()) await drawer().getByRole('button', { name: '关闭', exact: true }).first().click()
    await expect(page.locator('#field-note')).toHaveAttribute('placeholder', 'Inline renamed article')
    await expect(page.locator('#field-note')).toHaveValue('Do not overwrite this reaction')
  } finally { await publicClient.dispose() }
})
