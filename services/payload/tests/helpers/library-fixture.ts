import { getPayload } from 'payload'
import config from '../../src/payload.config'
import { workTypes } from '../../src/lib/metadata/types'

const payload = await getPayload({ config })
try {
  await payload.db.migrate()
  await payload.create({ collection: 'users', data: { email: 'library-test@example.test', password: 'temporary-library-password' } })
  const { default: sharp } = await import('sharp')
  const image = await sharp({ create: { width: 200, height: 300, channels: 3, background: '#557799' } }).png().toBuffer()
  const media = await payload.create({ collection: 'media', data: { alt: 'Library fixture cover' }, file: { data: image, mimetype: 'image/png', name: 'library-fixture.png', size: image.length } })
  const statuses = ['completed', 'in-progress', 'planned', 'on-hold', 'dropped'] as const
  for (const type of workTypes) {
    for (let index = 0; index < (type === 'game' ? 26 : 1); index++) {
      await payload.create({ collection: 'works', data: {
        type, title: `Library ${type} ${index}`, slug: `library-test-${type}-${index}`, visibility: 'public', _status: 'published',
        status: statuses[index % statuses.length], rating: index === 0 ? null : index === 1 ? 0 : 8,
        note: `Public note for ${type} ${index}`, cover: type === 'game' && index === 0 ? media.id : undefined,
        experiences: [{ endedOn: new Date(Date.UTC(2026, 11, 31 - index)).toISOString() }],
        sources: [{ provider: 'test', externalId: `${type}-${index}`, url: `https://example.test/${type}/${index}` }],
      } })
    }
  }
  await payload.create({ collection: 'works', data: { title: 'LIBRARY_PRIVATE_SENTINEL', slug: 'library-private-sentinel', type: 'game', visibility: 'private', note: 'PRIVATE_NOTE_SENTINEL' } })
  console.log('Library fixture: 33 public Works, 1 private Work, 1 uploaded cover.')
} finally { await payload.destroy() }
