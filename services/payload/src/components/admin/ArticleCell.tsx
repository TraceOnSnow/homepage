'use client'

import { useDocumentDrawer, useListDrawer } from '@payloadcms/ui'
import type { Post } from '@/payload-types'

export type ArticleSummary = Pick<Post, 'id' | 'title' | 'link' | 'locale' | '_status'>

export function ArticleCell({ title, articleID, article, disabled, onChange, onArticle }: {
  title: string; articleID: number | null; article?: ArticleSummary; disabled: boolean
  onChange: (id: number | null) => void; onArticle: (post: ArticleSummary) => void
}) {
  const [ListDrawer, , list] = useListDrawer({ collectionSlugs: ['posts'], selectedCollection: 'posts' })
  const [CreateDrawer, , create] = useDocumentDrawer({ collectionSlug: 'posts' })
  const [EditDrawer, , edit] = useDocumentDrawer({ collectionSlug: 'posts', id: articleID ?? undefined })
  const selectArticle = (doc: ArticleSummary) => { onArticle(doc); onChange(Number(doc.id)) }
  return <div className="works-table__article">
    {articleID ? <a href={`/admin/collections/posts/${articleID}`} onClick={event => { event.preventDefault(); if (!disabled) edit.openDrawer() }}>
      {article?.title || `文章 #${articleID}`}{article?._status === 'draft' ? '（草稿）' : ''}
    </a> : <span className="works-table__muted">无</span>}
    <div className="works-table__actions">
      <button type="button" disabled={disabled} aria-label={`${title}选择笔记`} onClick={list.openDrawer}>选择</button>
      <button type="button" disabled={disabled} aria-label={`${title}新建笔记`} onClick={create.openDrawer}>新建</button>
      {articleID && <button type="button" disabled={disabled} aria-label={`${title}取消关联`} onClick={() => onChange(null)}>取消关联</button>}
    </div>
    <ListDrawer allowCreate={false} onSelect={({ doc }) => { selectArticle(doc as ArticleSummary); list.closeDrawer() }} />
    <CreateDrawer redirectAfterCreate={false} redirectAfterDuplicate={false} initialData={{ title: `${title} · 感想` }} onSave={({ doc }) => { selectArticle(doc as ArticleSummary); create.closeDrawer() }} />
    {articleID && <EditDrawer redirectAfterDuplicate={false} redirectAfterDelete={false} onDelete={() => { onChange(null); edit.closeDrawer() }} onSave={({ doc }) => { onArticle(doc as ArticleSummary); edit.closeDrawer() }} />}
  </div>
}
