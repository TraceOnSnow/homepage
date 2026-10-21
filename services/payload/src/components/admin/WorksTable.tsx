'use client'

import { useEffect, useRef, useState } from 'react'
import { useDocumentDrawer } from '@payloadcms/ui'
import { workTypes } from '@/lib/metadata/types'
import { dictionaries } from '@/lib/ui/dictionary'
import { finishedSortValue, isWorkDirty, matchesWorkTableFilters, shouldConfirmWorkNavigation, workPublicationLabel, workValues, type TableWork, type WorkValues } from '@/lib/works-table'
import { ArticleCell, type ArticleSummary } from './ArticleCell'
import { AddWorkDialog } from './AddWorkDialog'
import { readTableWork, saveTableDrafts, tableDocuments, tableRequest, writeTableWork, type TableSaveProgress } from './works-table-api'
import './works-table.css'

type Row = { base: TableWork; publishedBase: TableWork; values: WorkValues; error?: string; saved?: string }
const statuses = ['planned', 'in-progress', 'completed', 'on-hold', 'dropped'] as const
const pageSize = 50
const rowFor = (base: TableWork, publishedBase = base): Row => ({ base, publishedBase, values: workValues(base) })

export function WorksTable() {
  const [rows, setRows] = useState<Row[]>([])
  const [articles, setArticles] = useState<Record<number, ArticleSummary>>({})
  const [busy, setBusy] = useState(true)
  const [loadError, setLoadError] = useState<string>()
  const [message, setMessage] = useState('正在读取全部作品…')
  const [query, setQuery] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [missing, setMissing] = useState('')
  const [attention, setAttention] = useState('')
  const [page, setPage] = useState(1)
  const [adding, setAdding] = useState<'completed' | 'planned'>()
  const [progress, setProgress] = useState<TableSaveProgress>()
  const table = useRef<HTMLDivElement>(null)
  const writing = useRef(false)
  const dirtyCount = rows.filter(row => isWorkDirty(row.base, row.values)).length
  const errorCount = rows.filter(row => row.error).length

  async function load() {
    setBusy(true)
    setLoadError(undefined)
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
    } catch (error) { setLoadError((error as Error).message); setMessage('列表读取未完成，已有内容保持。请重试。') }
    finally { setBusy(false) }
  }
  useEffect(() => { void load() }, [])
  useEffect(() => {
    if (!dirtyCount) return
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    const navigate = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(anchor instanceof HTMLAnchorElement) || event.defaultPrevented) return
      if (!shouldConfirmWorkNavigation(window.location.href, anchor.href, {
        button: event.button, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, altKey: event.altKey,
        target: anchor.getAttribute('target'), download: anchor.hasAttribute('download'),
        inDrawer: Boolean(anchor.closest('dialog, [role="dialog"], .doc-drawer, .list-drawer')),
        inTable: Boolean(table.current?.contains(anchor)),
      })) return
      if (!window.confirm(`还有 ${dirtyCount} 条作品未保存。离开会丢失这些输入，确定离开？`)) {
        event.preventDefault(); event.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    // Capture before Next's navigation handler; native drawer links are excluded.
    document.addEventListener('click', navigate, true)
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', navigate, true) }
  }, [dirtyCount])

  function change(id: number, patch: Partial<WorkValues>) {
    setRows(current => current.map(row => row.base.id === id ? { ...row, values: { ...row.values, ...patch }, saved: undefined } : row))
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
    void mergeWork(work); setQuery(work.title); setType(''); setStatus(''); setMissing(''); setAttention(''); setPage(1)
    setMessage(`已定位作品：${work.title}。可继续保存草稿；需要上站时再主动发布。`)
  }

  async function save(ids?: number[]) {
    if (writing.current) return
    writing.current = true
    setBusy(true)
    try {
      const result = await saveTableDrafts(ids ? rows.filter(row => ids.includes(row.base.id)) : rows, result => {
        setRows(current => current.map(item => item.base.id !== result.id ? item : result.saved
          ? { ...rowFor(result.saved.latest, result.saved.publishedBase), saved: '已保存草稿' } : { ...item, error: result.error }))
      }, setProgress)
      setMessage(`草稿保存成功 ${result.success} 条，未保存 ${result.failed} 条。${result.failed ? '失败行的输入已保留，可点击“查看失败”核对并单独重试。' : '现有公开版本继续保留；主动发布后网站才会更新。'}`)
    } finally { writing.current = false; setProgress(undefined); setBusy(false) }
  }

  async function publication(row: Row, action: 'publish' | 'unpublish') {
    if (writing.current) return
    writing.current = true
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
    } finally { writing.current = false; setBusy(false) }
  }

  const visible = rows.filter(row => matchesWorkTableFilters(row.base, row.values, { query, type, status, missing, attention }, row.error))
  const pages = Math.max(1, Math.ceil(visible.length / pageSize))
  const currentPage = Math.min(page, pages)
  const pageRows = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const hiddenDirty = rows.filter(row => isWorkDirty(row.base, row.values) && !pageRows.includes(row)).length
  const hasFilters = Boolean(query || type || status || missing || attention)
  const filter = (setter: (value: string) => void, value: string) => { setter(value); setPage(1) }
  const clearFilters = (attention = '') => { setQuery(''); setType(''); setStatus(''); setMissing(''); setAttention(attention); setPage(1) }

  return <div className="works-table" ref={table} onKeyDown={event => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 's') return
    const target = event.target
    if (!(target instanceof Element) || !table.current?.contains(target) || target.closest('dialog, [role="dialog"], .doc-drawer, .list-drawer')) return
    event.preventDefault()
    if (!busy && dirtyCount) void save()
  }}>
    <h1>作品表格</h1>
    <p>直接整理评分、状态和体验时间。时间可填 2020、2020-05 或 2020-05-18；未知留空。日期编辑对应最后一条体验记录，其他历史记录保持不变。</p>
    <div className="works-table__toolbar">
      <input aria-label="搜索已收录作品" placeholder="搜索已收录作品" value={query} onChange={event => filter(setQuery, event.target.value)} />
      <select aria-label="筛选类型" value={type} onChange={event => filter(setType, event.target.value)}><option value="">全部类型</option>{workTypes.map(type => <option key={type} value={type}>{dictionaries.zh[type]}</option>)}</select>
      <select aria-label="筛选状态" value={status} onChange={event => filter(setStatus, event.target.value)}><option value="">全部状态</option><option value="unknown">未填写状态</option>{statuses.map(value => <option key={value} value={value}>{dictionaries.zh[value]}</option>)}</select>
      <select aria-label="筛选待补充信息" value={missing} onChange={event => filter(setMissing, event.target.value)}><option value="">全部记录</option><option value="rating">未评分</option><option value="date">未填结束时间</option></select>
      <select aria-label="筛选待处理修改" value={attention} onChange={event => filter(setAttention, event.target.value)}><option value="">全部修改状态</option><option value="dirty">未保存（{dirtyCount}）</option><option value="errors">操作失败（{errorCount}）</option></select>
      <button type="button" disabled={!hasFilters} onClick={() => clearFilters()}>清除筛选</button>
      <button type="button" disabled={busy} onClick={() => setAdding('completed')}>＋记录作品</button>
      <button type="button" disabled={busy} onClick={() => setAdding('planned')}>加入待体验</button>
    </div>
    <div className="works-table__savebar" role="region" aria-label="作品保存操作">
      <button type="button" title="Ctrl / ⌘ S：保存表格草稿" disabled={busy || !dirtyCount} onClick={() => void save()}>保存草稿（{dirtyCount}）</button>
      <button type="button" disabled={busy || Boolean(dirtyCount)} onClick={() => void load()}>刷新列表</button>
      {hiddenDirty > 0 && <button type="button" onClick={() => clearFilters('dirty')}>查看未保存（{hiddenDirty} 条不在本页）</button>}
      {errorCount > 0 && <button type="button" onClick={() => clearFilters('errors')}>查看失败（{errorCount}）</button>}
      <span aria-live="polite">{progress ? `正在保存 ${progress.done} / ${progress.total} 条${progress.title ? `：${progress.title}` : ''}` : busy ? '正在核对作品状态…' : dirtyCount ? '包括其他页的修改；保存不会发布。' : loadError ? '列表读取尚未完成' : '当前输入已保存'}</span>
    </div>
    <p role="status" aria-live="polite">{message}</p>
    {loadError && <p role="alert">{loadError} <button type="button" disabled={busy || Boolean(dirtyCount)} onClick={() => void load()}>重新读取列表</button></p>}
    <p className="works-table__muted">保存草稿保留网站旧版本。每行主动发布后，按所选可见性更新；下架保留草稿和历史。关联文章有独立发布状态，保存作品不会发布文章。短感受留空时使用文章标题。</p>
    <div className="works-table__scroll" role="region" aria-label="作品编辑表格" aria-busy={busy} tabIndex={0}>
      <table><caption>全部作品及个人记录，共 {rows.length} 条；当前筛选 {visible.length} 条</caption>
        <thead><tr>{['作品', '状态', '个人评分', '开始时间', '结束时间', '短感受', '关联笔记', '发布时可见性', '草稿与发布'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{pageRows.map(row => <WorkTableRow key={row.base.id} row={row} articles={articles} disabled={busy}
          onChange={patch => change(row.base.id, patch)} onArticle={post => setArticles(current => ({ ...current, [post.id]: post }))} onWork={mergeWork}
          onRemove={() => setRows(current => current.filter(item => item.base.id !== row.base.id))}
          onPublish={() => void publication(row, 'publish')} onUnpublish={() => void publication(row, 'unpublish')}
          onSave={() => void save([row.base.id])}
          onReset={() => { if (window.confirm('放弃本行未保存的输入，重新读取最新记录？')) void readTableWork(row.base.id).then(({ latest, publishedBase }) => setRows(current => current.map(item => item.base.id === latest.id ? rowFor(latest, publishedBase) : item))).catch(error => setMessage(error.message)) }} />)}</tbody>
      </table>
      {!visible.length && !busy && !loadError && <p>{hasFilters ? '没有符合筛选条件的作品，可清除筛选或查看未保存修改。' : '还没有作品，点击“记录作品”开始。'}</p>}
    </div>
    <div className="works-table__toolbar">
      <button type="button" disabled={busy || currentPage <= 1} onClick={() => setPage(currentPage - 1)}>上一页</button>
      <span aria-live="polite">第 {currentPage} / {pages} 页，每页 {pageSize} 条 · 当前显示 {visible.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, visible.length)} / {visible.length} 条</span>
      <button type="button" disabled={busy || currentPage >= pages} onClick={() => setPage(currentPage + 1)}>下一页</button>
    </div>
    {adding && <AddWorkDialog status={adding} works={rows.map(row => row.base)} onWork={added} onClose={() => setAdding(undefined)} />}
  </div>
}

function WorkTableRow({ row, articles, disabled, onChange, onArticle, onWork, onReset, onRemove, onPublish, onUnpublish, onSave }: {
  row: Row; articles: Record<number, ArticleSummary>; disabled: boolean
  onChange: (patch: Partial<WorkValues>) => void; onArticle: (post: ArticleSummary) => void
  onWork: (work: TableWork) => void; onReset: () => void; onRemove: () => void; onPublish: () => void; onUnpublish: () => void; onSave: () => void
}) {
  const { base: work, values } = row
  const dirty = isWorkDirty(work, values)
  const article = values.article ? articles[values.article] : undefined
  const [Drawer, , drawer] = useDocumentDrawer({ collectionSlug: 'works', id: work.id })
  return <tr data-work-id={work.id} className={row.error ? 'works-table__error' : dirty ? 'works-table__dirty' : undefined}>
    <td data-label="作品"><a href={`/admin/collections/works/${work.id}`} aria-disabled={disabled || dirty} title={dirty ? '请先保存本行草稿，再打开详情' : '打开作品详情'} onClick={event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return
      event.preventDefault(); if (!disabled && !dirty) drawer.openDrawer()
    }}>
      {work.coverUrl && <img className="works-table__cover" src={work.coverUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />}{work.title}</a>
      <small>{dictionaries.zh[work.type]}{(work.experiences?.length || 0) > 1 ? ` · ${work.experiences!.length} 次体验` : ''}</small>
      {dirty && <small>请先保存本行草稿，再打开详情</small>}
      <Drawer redirectAfterDuplicate={false} redirectAfterDelete={false} onDelete={() => { onRemove(); drawer.closeDrawer() }}
        onDuplicate={async ({ doc }) => { onWork(await tableRequest<TableWork>(`works/${doc.id}?depth=0&draft=true`)); drawer.closeDrawer() }}
        onSave={async () => { const saved = await tableRequest<TableWork>(`works/${work.id}?depth=0&draft=true`); onWork(saved); drawer.closeDrawer() }} />
    </td>
    <td data-label="状态"><select aria-label={`${work.title}状态`} value={values.status} disabled={disabled} onChange={event => onChange({ status: event.target.value })}><option value="">未填写</option>{statuses.map(value => <option key={value} value={value}>{dictionaries.zh[value]}</option>)}</select></td>
    <td data-label="个人评分"><input aria-label={`${work.title}评分`} className="works-table__rating" type="number" min="0" max="10" step="0.1" value={values.rating} disabled={disabled} onChange={event => onChange({ rating: event.target.value })} /></td>
    <td data-label="开始时间"><input aria-label={`${work.title}开始时间`} className="works-table__date" value={values.startedOn} disabled={disabled} placeholder="可空" onChange={event => onChange({ startedOn: event.target.value })} /></td>
    <td data-label="结束时间"><input aria-label={`${work.title}结束时间`} className="works-table__date" value={values.endedOn} disabled={disabled} placeholder="年 / 月 / 日" onChange={event => onChange({ endedOn: event.target.value })} /></td>
    <td data-label="短感受"><textarea aria-label={`${work.title}短感受`} rows={2} value={values.note} placeholder={article?.title || ''} disabled={disabled} onChange={event => onChange({ note: event.target.value })} /></td>
    <td data-label="关联笔记"><ArticleCell title={work.title} articleID={values.article} article={article} disabled={disabled} onArticle={onArticle} onChange={article => onChange({ article })} /></td>
    <td data-label="发布时可见性"><select aria-label={`${work.title}可见性`} value={values.visibility} disabled={disabled} onChange={event => onChange({ visibility: event.target.value })}><option value="private">私密</option><option value="public">公开</option></select></td>
    <td data-label="草稿与发布"><strong>{workPublicationLabel(work, row.publishedBase)}</strong><small role={row.error ? 'alert' : undefined}>{row.error || (isWorkDirty(work, values) ? '有未保存修改，请先保存草稿' : row.saved || '所有输入已保存')}</small>
      <div className="works-table__actions">
        {isWorkDirty(work, values) && <button type="button" aria-label={`${work.title}保存本行草稿`} disabled={disabled} onClick={onSave}>保存本行草稿</button>}
        <button type="button" aria-label={`${work.title}发布`} disabled={disabled || Boolean(row.error) || isWorkDirty(work, values) || work._status === 'published'} onClick={onPublish}>{values.visibility === 'public' ? '发布到网站' : '发布（私密）'}</button>
        {row.publishedBase._status === 'published' && <button type="button" aria-label={`${work.title}下架`} disabled={disabled || Boolean(row.error) || isWorkDirty(work, values)} onClick={onUnpublish}>下架</button>}
        {row.error && <button type="button" disabled={disabled} onClick={onReset}>重新读取本行</button>}
      </div>
    </td>
  </tr>
}
