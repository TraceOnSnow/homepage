'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useDocumentDrawer, useListDrawer } from '@payloadcms/ui'
import type { CoverPoolImage, CoverPoolSnapshot } from '@/lib/cover-pool'
import { shouldConfirmWorkNavigation } from '@/lib/works-table'
import type { Media } from '@/payload-types'
import './cover-pool.css'

async function requestPool(method = 'GET', body?: unknown): Promise<CoverPoolSnapshot> {
  const response = await fetch('/api/site-covers', { method, credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || '封面池读取失败，请稍后重试。')
  return result
}
const builtInIDs = Array.from({ length: 21 }, (_, index) => index + 1)
const sameSelection = (base: CoverPoolSnapshot | null, includeBuiltIn: boolean, ids: number[], builtIns: number[]) =>
  !!base && base.includeBuiltIn === includeBuiltIn && JSON.stringify(base.mediaIds) === JSON.stringify(ids) && JSON.stringify(base.builtInIds ?? builtInIDs) === JSON.stringify(builtIns)

export function CoverPool() {
  const [base, setBase] = useState<CoverPoolSnapshot | null>(null)
  const [includeBuiltIn, setIncludeBuiltIn] = useState(true)
  const [builtIns, setBuiltIns] = useState<number[]>(builtInIDs)
  const [ids, setIDs] = useState<number[]>([])
  const [images, setImages] = useState<CoverPoolImage[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('正在读取封面池…')
  const [ListDrawer, , list] = useListDrawer({ collectionSlugs: ['media'], selectedCollection: 'media' })
  const [CreateDrawer, , create] = useDocumentDrawer({ collectionSlug: 'media' })
  const dirty = !!base && !sameSelection(base, includeBuiltIn, ids, builtIns)
  const load = useCallback(async () => {
    setBusy(true); setError('')
    try {
      const snapshot = await requestPool()
      setBuiltIns(snapshot.builtInIds ?? builtInIDs); setBase(snapshot); setIncludeBuiltIn(snapshot.includeBuiltIn); setIDs(snapshot.mediaIds); setImages(snapshot.images)
      setStatus('已读取封面池。')
    } catch (error) { setError(error instanceof Error ? error.message : '封面池读取失败。') }
    finally { setBusy(false) }
  }, [])
  useEffect(() => { const timer = setTimeout(() => { void load() }, 0); return () => clearTimeout(timer) }, [load])
  useEffect(() => {
    if (!dirty) return
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    const navigate = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest('a[href]') as HTMLAnchorElement | null : null
      if (!(target instanceof HTMLAnchorElement) || event.defaultPrevented) return
      if (!shouldConfirmWorkNavigation(window.location.href, target.href, {
        button: event.button, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, altKey: event.altKey,
        target: target.getAttribute('target'), download: target.hasAttribute('download'),
        inDrawer: Boolean(target.closest('dialog, [role="dialog"], .doc-drawer, .list-drawer')), inTable: false,
      })) return
      if (!window.confirm('封面池还有未保存的选择，确定离开？')) {
        event.preventDefault(); event.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', unload); document.addEventListener('click', navigate, true)
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', navigate, true) }
  }, [dirty])
  const add = (doc: Media) => {
    if (!doc.url || !doc.mimeType?.startsWith('image/')) { setError('请选择已上传的图片。'); return }
    if (!ids.includes(doc.id) && ids.length >= 200) { setError('最多选择200张上传图片，请先移除不需要的图片。'); return }
    setImages(current => [...current.filter(image => image.id !== doc.id), { id: doc.id, url: doc.url!, alt: doc.alt,
      ...(doc.width ? { width: doc.width } : {}), ...(doc.height ? { height: doc.height } : {}) }])
    setIDs(current => current.includes(doc.id) ? current : [...current, doc.id]); setError(''); setStatus('选择尚未保存。')
  }
  const save = async () => {
    if (!base) return
    setBusy(true); setError(''); setStatus('正在保存…')
    try {
      const saved = await requestPool('PATCH', { revision: base.revision, includeBuiltIn, mediaIds: ids, builtInIds: builtIns })
      const verified = await requestPool()
      if (saved.revision !== verified.revision) throw new Error('保存后封面池又有更新，请重新读取核对；当前选择仍保留。')
      setBuiltIns(verified.builtInIds ?? builtInIDs); setBase(verified); setIncludeBuiltIn(verified.includeBuiltIn); setIDs(verified.mediaIds); setImages(verified.images)
      setStatus('封面池已保存并核对。网站将在原有发布流程完成后更新。')
    } catch (error) { setError(`${error instanceof Error ? error.message : '保存结果暂未确认。'} 请先重新读取核对，再决定是否保存。`); setStatus('当前选择仍保留。') }
    finally { setBusy(false) }
  }
  const missing = ids.filter(id => !images.some(image => image.id === id))
  return <div className="cover-pool">
    <h1>默认封面池</h1>
    <p>没有单独封面的文章会从这里选择图片。原有21张动漫默认图可继续使用，无需重新上传；这里的选择不会修改文章正文。</p>
    <p>新增图片请使用原生媒体上传，图片将公开提供给网站访客。移出封面池会保留媒体原文件。</p>
    <div className="cover-pool__toolbar">
      <button type="button" disabled={busy || !base} onClick={list.openDrawer}>选择已有图片</button>
      <button type="button" disabled={busy || !base} onClick={create.openDrawer}>上传新图片</button>
      <button type="button" disabled={busy} onClick={() => { if (!dirty || window.confirm('重新读取会替换未保存的选择，是否继续？')) void load() }}>重新读取</button>
      <button type="button" disabled={busy || !dirty || ((!includeBuiltIn || !builtIns.length) && !ids.length) || missing.length > 0} onClick={() => void save()}>保存封面池</button>
      <Link href="/admin/collections/media">管理全部媒体</Link>
    </div>
    <p role="status">{status}{dirty ? ' 有未保存的选择。' : ''}</p>
    {error && <p role="alert" className="cover-pool__error">{error}</p>}
    {base && <>
      <label className="cover-pool__toggle"><input type="checkbox" checked={includeBuiltIn} disabled={busy} onChange={event => setIncludeBuiltIn(event.target.checked)} />使用原有动漫默认图（下方可逐张选择）</label>
      {includeBuiltIn && <div className="cover-pool__grid cover-pool__built-in" aria-label="原有默认封面">
        {Array.from({ length: 21 }, (_, index) => <div key={index}><img src={`/img/cover/${index + 1}.webp`} alt={`原有默认封面 ${index + 1}`} loading="lazy" /><label><input type="checkbox" aria-label={`使用默认图 ${index + 1}`} disabled={busy} checked={builtIns.includes(index + 1)} onChange={event => setBuiltIns(current => event.target.checked ? [...current, index + 1].sort((a, b) => a - b) : current.filter(id => id !== index + 1))} />默认图 {index + 1}</label></div>)}
      </div>}
      <h2>已选媒体（{ids.length} / 200）</h2>
      {!ids.length && <p>尚未选择上传图片。</p>}
      {!!missing.length && <p role="alert">部分已选图片已失效。请明确移除这些图片后再保存；其余选择会保留。</p>}
      <div className="cover-pool__grid" aria-label="已选媒体">
        {ids.map(id => {
          const image = images.find(image => image.id === id)
          return <div key={id} data-media-id={id}>
            {image ? <img src={image.url} alt={image.alt} loading="lazy" /> : <p className="cover-pool__error">图片 #{id} 已失效</p>}
            <span>{image?.alt || `图片 #${id}`}</span>
            <label><input type="checkbox" checked disabled={busy} onChange={() => setIDs(current => current.filter(value => value !== id))} />用于默认封面（取消即移出）</label>
          </div>
        })}
      </div>
      {(!includeBuiltIn || !builtIns.length) && !ids.length && <p role="alert">请至少保留一张默认封面。</p>}
    </>}
    <ListDrawer allowCreate={false} onSelect={({ doc }) => { add(doc as Media); list.closeDrawer() }} />
    <CreateDrawer redirectAfterCreate={false} redirectAfterDuplicate={false} onSave={({ doc }) => { add(doc as Media); create.closeDrawer() }} />
  </div>
}
