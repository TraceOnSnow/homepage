import { readFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import type { Post } from '../src/payload-types'

const manifest = process.argv[2]
if (!manifest || manifest.startsWith('--')) throw new Error('Usage: npm run import:markdown -- /private/import-plan.json [--apply]')
const apply = process.argv.includes('--apply')
if (apply) process.env.PAYLOAD_IMPORT_TRANSACTION = '1'
const { default: config } = await import('../src/payload.config')
const plan = JSON.parse(await readFile(manifest, 'utf8')) as Array<{ file: string; data: Omit<Post, 'id' | 'createdAt' | 'updatedAt' | 'link'> & { link: string }; works: string[] }>
if (!Array.isArray(plan) || !plan.length) throw new Error('Nonempty import plan required')
const payload = await getPayload({ config })
try {
  const existing = await payload.find({ collection: 'posts', pagination: false, limit: 10000, depth: 0 })
  const routes = new Set(existing.docs.map(post => `${post.locale}/${post.link}`))
  for (const item of plan) {
    if (typeof item.data.link !== 'string' || !Array.isArray(item.works)) throw new Error('Invalid import plan')
    if (routes.has(`${item.data.locale}/${item.data.link}`)) throw new Error(`Existing article would be overwritten: ${item.file}`)
  }
  const associations = new Map<string, string>()
  for (const item of plan) {
    for (const slug of item.works) {
      if (associations.has(slug) && associations.get(slug) !== item.data.link) throw new Error(`Multiple articles for Work ${slug}; choose manually before importing.`)
      associations.set(slug, item.data.link)
    }
  }
  const works = await payload.find({ collection: 'works', pagination: false, limit: 10000, depth: 0 })
  for (const slug of associations.keys()) {
    const work = works.docs.find(work => work.slug === slug)
    if (!work || work.article) throw new Error(`Missing Work or existing article association: ${slug}`)
  }
  console.log(JSON.stringify({ apply, articles: plan.length, associations: associations.size, files: plan.map(item => item.file) }))
  if (apply) {
    const transactionID = await payload.db.beginTransaction()
    if (!transactionID) throw new Error('Import requires a database transaction')
    const req = { transactionID }
    try {
      const ids = new Map<string, number>()
      // Prefer the default language for the canonical single relationship.
      for (const item of [...plan].sort((a, b) => Number(b.data.locale === 'zh') - Number(a.data.locale === 'zh'))) {
        const post = await payload.create({ collection: 'posts', data: item.data, draft: item.data._status === 'draft', req })
        if (post.markdown !== item.data.markdown) throw new Error('Markdown preservation verification failed')
        if (!ids.has(item.data.link)) ids.set(item.data.link, post.id)
      }
      for (const [slug, link] of associations) {
        const work = works.docs.find(work => work.slug === slug)!
        await payload.update({ collection: 'works', id: work.id, data: { article: ids.get(link) }, req })
      }
      await payload.db.commitTransaction(transactionID)
    } catch (error) { await payload.db.rollbackTransaction(transactionID); throw error }
    console.log('Import committed; source files unchanged. Verify output before selecting CONTENT_SOURCE=payload.')
  }
} finally { await payload.destroy() }
