'use client'

import { useEffect, useState } from 'react'
import { TextareaInput, useDocumentEvents, useField, useFormFields } from '@payloadcms/ui'
import type { TextareaFieldClientProps } from 'payload'

export function ReactionField({ path, field, readOnly }: TextareaFieldClientProps) {
  const { value, setValue, showError } = useField<string>({ path })
  const article = useFormFields(([fields]) => fields.article?.value)
  const { mostRecentUpdate } = useDocumentEvents()
  const [loaded, setLoaded] = useState<{ article: unknown; title: string }>()
  useEffect(() => {
    const id = typeof article === 'object' && article ? (article as { id?: unknown }).id : article
    if (typeof id !== 'number' && typeof id !== 'string') return
    const controller = new AbortController()
    fetch(`/api/posts/${encodeURIComponent(String(id))}?depth=0&draft=true`, { credentials: 'same-origin', signal: controller.signal })
      .then(async response => response.ok ? response.json() : null)
      .then(post => { if (!controller.signal.aborted && typeof post?.title === 'string') setLoaded({ article, title: post.title }) })
      .catch(() => {})
    return () => controller.abort()
  }, [article, mostRecentUpdate])
  return <TextareaInput path={path} label={field.label} value={value || ''} onChange={event => setValue(event.target.value)}
    placeholder={loaded?.article === article ? loaded?.title : ''} readOnly={readOnly} showError={showError} description={field.admin?.description} />
}
