'use client'

import { useEffect, useState } from 'react'
import { useDocumentDrawer } from '@payloadcms/ui'
import { workTypes } from '@/lib/metadata/types'
import { dictionaries } from '@/lib/ui/dictionary'
import { finishedSortValue, isWorkDirty, workPatch, workPublicationLabel, workValues, type TableWork, type WorkValues } from '@/lib/works-table'
import { ArticleCell, type ArticleSummary } from './ArticleCell'
import { AddWorkDialog } from './AddWorkDialog'
import { readTableWork, tableDocuments, tableRequest, writeTableWork } from './works-table-api'
import './works-table.css'

type Row = { base: TableWork; publishedBase: TableWork; values: WorkValues; error?: string; saved?: string }
const statuses = ['planned', 'in-progress', 'completed', 'on-hold', 'dropped'] as const
const pageSize = 50
const rowFor = (base: TableWork, publishedBase = base): Row => ({ base, publishedBase, values: workValues(base) })

export function WorksTable() {
  const [rows, setRows] = useState<Row[]>([])
  const [articles, setArticles] = useState<Record<number, ArticleSummary>>({})
  const [busy, setBusy] = useState(true)
  const [message, setMessage] = useState('正在读取全部作品…')
  const [query, setQuery] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [missing, setMissing] = useState('')
  const [page, setPage] = useState(1)
  const [adding, setAdding] = useState<'completed' | 'planned'>()
  const dirtyCount = rows.filter(row => isWorkDirty(row.base, row.values)).length

  async function load() {
    setBusy(true)
    try {
      const [works, published, posts] = await Promise.all([
        tableDocuments<TableWork>('works?draft=true'),
        tableDocuments<TableWork>('works?draft=false'),
        tableDocuments<ArticleSummary>('posts?draft=true&select[title]=true&select[link]=true&select[locale]=true&select[_status]=true'),
      ])
      works.sort((a, b) => finishedSortValue(b) - finishedSortValue(a) || b.id - a.id)
      const originals = new Map(published.map(work => [work.id, work]))
      setRows(works.map(work => rowFor(work, originals.get(work.id)))); setArticles(Object.fromEntries(posts.map(post => [post.id, post])))
      setMessage(`已读取 ${works.length} 条作品的最新草稿与发布状态。`)
    } catch (error) { setMessage((error as Error).message) }
    finally { setBusy(false) }
  }
  useEffect(() => { void load() }, [])
  useEffect(() => {
    if (!dirtyCount) return
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirtyCount])

  function change(id: number, patch: Partial<WorkValues>) {
    setRows(current => current.map(row => row.base.id === id ? { ...row, values: { ...row.values, ...patch }, error: undefined, saved: undefined } : row))
  }
  async function mergeWork(work: TableWork) {
    try {
      const { latest, publishedBase } = await readTableWork(work.id)
      setRows(current => {
        const found = current.find(row => row.base.id === work.id)
        if (!found) return [rowFor(latest, publishedBase), ...current]
        return current.map(row => row.base.id !== work.id ? row : isWorkDirty(row.base, row.values)
          ? { ...row, error: '详情已保存，表格仍有未保存修改。请先核对，避免覆盖。' } : rowFor(latest, publishedBase))
      })
    } catch (error) { setMessage(`详情保存后的状态需要核对：${(error as Error).message}`) }
  }
  function added(work: TableWork) {
    void mergeWork(work); setQuery(work.title); setType(''); setStatus(''); setMissing(''); setPage(1)
    setMessage(`已定位作品：${work.title}。可继续保存草稿；需要上站时再主动发布。`)
  }

  async function save() {
    setBusy(true)
    let success = 0; let failed = 0
    for (const row of rows.filter(row => isWorkDirty(row.base, row.values))) {
      try {
        const patch = workPatch(row.base, row.values)
        const saved = await writeTableWork('save-draft', row.base, row.publishedBase, patch)
        setRows(current => current.map(item => item.base.id === row.base.id
          ? { ...rowFor(saved.latest, saved.publishedBase), saved: '已保存草稿' } : item))
        success++
      } catch (error) {
        failed++
        setRows(current => current.map(item => item.base.id === row.base.id ? { ...item, error: (error as Error).message } : item))
      }
    }
    setMessage(`草稿保存成功 ${success} 条，未保存 ${failed} 条。${failed ? '失败行的输入已保留，请查看对应提示。' : '现有公开版本继续保留；主动发布后网站才会更新。'}`)
    setBusy(false)
  }

  async function publication(row: Row, action: 'publish' | 'unpublish') {
    setBusy(true)
    try {
      const saved = await writeTableWork(action, row.base, row.publishedBase)
      const label = action === 'publish' ? (saved.latest.visibility === 'public' ? '已发布，等待网站更新' : '已发布为私密记录') : '已下架，草稿与历史已保留'
      setRows(current => current.map(item => item.base.id === row.base.id
        ? { ...rowFor(saved.latest, saved.publishedBase), saved: label } : item))
      setMessage(`${row.base.title}：${label}。${action === 'publish' && saved.latest.visibility === 'public' ? '停止编辑约 3 分钟并完成构建后更新网站。' : ''}`)
    } catch (error) {
      setRows(current => current.map(item => item.base.id === row.base.id ? { ...item, error: (error as Error).message } : item))
      setMessage('操作未确认成功，请查看该行提示；输入已保留。')
    } finally { setBusy(false) }
  }

  const visible = rows.filter(({ base }) => (!query || [base.title, ...(base.aliases || [])].some(text => text.toLowerCase().includes(query.toLowerCase())))
    && (!type || base.type === type) && (!status || (status === 'unknown' ? !base.status : base.status === status))
    && (missing !== 'rating' || base.rating == null) && (missing !== 'date' || !base.experiences?.some(row => row.endedOn)))
  const pages = Math.max(1, Math.ceil(visible.length / pageSize))
  const currentPage = Math.min(page, pages)
  const filter = (setter: (value: string) => void, value: string) => { setter(value); setPage(1) }

  return <div className="works-table">
    <h1>作品表格</h1>
    <p>直接整理评分、状态和体验时间。时间可填 2020、2020-05 或 2020-05-18；未知留空。日期编辑对应最后一条体验记录，其他历史记录保持不变。</p>
    <div className="works-table__toolbar">
      <input aria-label="搜索已收录作品" placeholder="搜索已收录作品" value={query} onChange={event => filter(setQuery, event.target.value)} />
      <select aria-label="筛选类型" value={type} onChange={event => filter(setType, event.target.value)}><option value="">全部类型</option>{workTypes.map(type => <option key={type} value={type}>{dictionaries.zh[type]}</option>)}</select>
      <select aria-label="筛选状态" value={status} onChange={event => filter(setStatus, event.target.value)}><option value="">全部状态</option><option value="unknown">未填写状态</option>{statuses.map(value => <option key={value} value={value}>{dictionaries.zh[value]}</option>)}</select>
      <select aria-label="筛选待补充信息" value={missing} onChange={event => filter(setMissing, event.target.value)}><option value="">全部记录</option><option value="rating">未评分</option><option value="date">未填结束时间</option></select>
      <button type="button" disabled={busy} onClick={() => setAdding('completed')}>＋记录作品</button>
      <button type="button" disabled={busy} onClick={() => setAdding('planned')}>加入待体验</button>
      <button type="button" disabled={busy || !dirtyCount} onClick={() => void save()}>保存草稿（{dirtyCount}）</button>
      <button type="button" disabled={busy || Boolean(dirtyCount)} onClick={() => void load()}>刷新列表</button>
    </div>
    <p role="status" aria-live="polite">{message}</p>
    <p className="works-table__muted">保存草稿保留网站旧版本。每行主动发布后，按所选可见性更新；下架保留草稿和历史。关联文章有独立发布状态，保存作品不会发布文章。短感受留空时使用文章标题。</p>
    <div className="works-table__scroll">
      <table><caption>全部作品及个人记录，共 {rows.length} 条；当前筛选 {visible.length} 条</caption>
        <thead><tr>{['作品', '状态', '个人评分', '开始时间', '结束时间', '短感受', '关联笔记', '发布时可见性', '草稿与发布'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{visible.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(row => <WorkTableRow key={row.base.id} row={row} articles={articles} disabled={busy}
          onChange={patch => change(row.base.id, patch)} onArticle={post => setArticles(current => ({ ...current, [post.id]: post }))} onWork={mergeWork}
          onRemove={() => setRows(current => current.filter(item => item.base.id !== row.base.id))}
          onPublish={() => void publication(row, 'publish')} onUnpublish={() => void publication(row, 'unpublish')}
          onReset={() => { if (window.confirm('放弃本行未保存的输入，重新读取最新记录？')) void readTableWork(row.base.id).then(({ latest, publishedBase }) => setRows(current => current.map(item => item.base.id === latest.id ? rowFor(latest, publishedBase) : item))).catch(error => setMessage(error.message)) }} />)}</tbody>
      </table>
      {!visible.length && !busy && <p>没有符合筛选条件的作品。</p>}
    </div>
    <div className="works-table__toolbar">
      <button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>上一页</button>
      <span>第 {currentPage} / {pages} 页，每页 {pageSize} 条</span>
      <button type="button" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>下一页</button>
    </div>
    {adding && <AddWorkDialog status={adding} works={rows.map(row => row.base)} onWork={added} onClose={() => setAdding(undefined)} />}
  </div>
}

function WorkTableRow({ row, articles, disabled, onChange, onArticle, onWork, onReset, onRemove, onPublish, onUnpublish }: {
  row: Row; articles: Record<number, ArticleSummary>; disabled: boolean
  onChange: (patch: Partial<WorkValues>) => void; onArticle: (post: ArticleSummary) => void
  onWork: (work: TableWork) => void; onReset: () => void; onRemove: () => void; onPublish: () => void; onUnpublish: () => void
}) {
  const { base: work, values } = row
  const article = values.article ? articles[values.article] : undefined
  const [Drawer, , drawer] = useDocumentDrawer({ collectionSlug: 'works', id: work.id })
  return <tr data-work-id={work.id} className={row.error ? 'works-table__error' : undefined}>
    <td><a href={`/admin/collections/works/${work.id}`} onClick={event => { event.preventDefault(); if (!disabled) drawer.openDrawer() }}>
      {work.coverUrl && <img className="works-table__cover" src={work.coverUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />}{work.title}</a>
      <small>{dictionaries.zh[work.type]}{(work.experiences?.length || 0) > 1 ? ` · ${work.experiences!.length} 次体验` : ''}</small>
      <Drawer redirectAfterDuplicate={false} redirectAfterDelete={false} onDelete={() => { onRemove(); drawer.closeDrawer() }}
        onDuplicate={async ({ doc }) => { onWork(await tableRequest<TableWork>(`works/${doc.id}?depth=0&draft=true`)); drawer.closeDrawer() }}
        onSave={async () => { const saved = await tableRequest<TableWork>(`works/${work.id}?depth=0&draft=true`); onWork(saved); drawer.closeDrawer() }} />
    </td>
    <td><select aria-label={`${work.title}状态`} value={values.status} disabled={disabled} onChange={event => onChange({ status: event.target.value })}><option value="">未填写</option>{statuses.map(value => <option key={value} value={value}>{dictionaries.zh[value]}</option>)}</select></td>
    <td><input aria-label={`${work.title}评分`} className="works-table__rating" type="number" min="0" max="10" step="0.1" value={values.rating} disabled={disabled} onChange={event => onChange({ rating: event.target.value })} /></td>
    <td><input aria-label={`${work.title}开始时间`} className="works-table__date" value={values.startedOn} disabled={disabled} placeholder="可空" onChange={event => onChange({ startedOn: event.target.value })} /></td>
    <td><input aria-label={`${work.title}结束时间`} className="works-table__date" value={values.endedOn} disabled={disabled} placeholder="年 / 月 / 日" onChange={event => onChange({ endedOn: event.target.value })} /></td>
    <td><textarea aria-label={`${work.title}短感受`} rows={2} value={values.note} placeholder={article?.title || ''} disabled={disabled} onChange={event => onChange({ note: event.target.value })} /></td>
    <td><ArticleCell title={work.title} articleID={values.article} article={article} disabled={disabled} onArticle={onArticle} onChange={article => onChange({ article })} /></td>
    <td><select aria-label={`${work.title}可见性`} value={values.visibility} disabled={disabled} onChange={event => onChange({ visibility: event.target.value })}><option value="private">私密</option><option value="public">公开</option></select></td>
    <td><strong>{workPublicationLabel(work, row.publishedBase)}</strong><small role={row.error ? 'alert' : undefined}>{row.error || (isWorkDirty(work, values) ? '有未保存修改，请先保存草稿' : row.saved || '所有输入已保存')}</small>
      <div className="works-table__actions">
        <button type="button" aria-label={`${work.title}发布`} disabled={disabled || Boolean(row.error) || isWorkDirty(work, values) || work._status === 'published'} onClick={onPublish}>{values.visibility === 'public' ? '发布到网站' : '发布（私密）'}</button>
        {row.publishedBase._status === 'published' && <button type="button" aria-label={`${work.title}下架`} disabled={disabled || Boolean(row.error) || isWorkDirty(work, values)} onClick={onUnpublish}>下架</button>}
        {row.error && <button type="button" disabled={disabled} onClick={onReset}>重新读取本行</button>}
      </div>
    </td>
  </tr>
}
