import type { CollectionBeforeChangeHook, CollectionBeforeDeleteHook } from 'payload'

// Native Trash uses PATCH deletedAt. A raw DELETE permanently removes history,
// so normal content tools and Admin must use the recoverable lifecycle instead.
export const preserveContentHistory: CollectionBeforeDeleteHook = () => {
  throw new Error('Use Trash to retain content and versions. Permanent deletion requires a separate reviewed recovery plan.')
}

export const restoreAsDraft: CollectionBeforeChangeHook = ({ data, originalDoc, collection }) => {
  if (originalDoc?.deletedAt && data.deletedAt === null) {
    data._status = 'draft'
    if (collection.slug === 'works') data.visibility = 'private'
  }
  return data
}
