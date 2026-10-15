import { writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '../../src/payload.config'

const payload = await getPayload({ config })
try {
  const post = await payload.create({ collection: 'posts', data: { title: 'Native Markdown review', link: 'native-review', locale: 'zh', markdown: '## Native render\n\n++Highlighted++\n\n:::info\nNative note\n:::\n', publishedAt: '2020-01-01T00:00:00Z', _status: 'published' } })
  const draft = await payload.create({ collection: 'posts', data: { title: 'DRAFT MUST STAY PRIVATE', link: 'private-draft', locale: 'zh', publishedAt: '2020-01-01T00:00:00Z', markdown: 'DRAFT SOURCE MUST STAY PRIVATE', _status: 'draft' } })
  await payload.create({ collection: 'posts', data: { title: 'Protected review', link: 'protected-review', locale: 'zh', publishedAt: '2020-01-01T00:00:00Z', markdown: 'PROTECTED BODY MUST NEVER BE PUBLISHED IN PLAINTEXT', frontmatter: { password: 'fixture-password' }, _status: 'published' } })
  for (const [slug, article, note] of [['fallback-work', post.id, ''], ['own-reaction', post.id, 'MY SHORT REACTION'], ['draft-work', draft.id, 'Draft article remains a gray note']] as const) {
    await payload.create({ collection: 'works', data: { title: slug, slug, type: 'game', article, note, visibility: 'public' } })
  }
  const works = await payload.find({ collection: 'works', where: { visibility: { equals: 'public' } }, pagination: false, depth: 0 })
  const posts = await payload.find({ collection: 'posts', where: { _status: { equals: 'published' } }, pagination: false, draft: false, depth: 1 })
  await writeFile(process.env.POSTS_FIXTURE_SNAPSHOT!, JSON.stringify({ works: works.docs, posts: posts.docs }), { mode: 0o600 })
  console.log('SNAPSHOT_READY')
} finally { await payload.destroy() }
