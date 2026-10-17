'use client'

import { useEffect, useRef, useState } from 'react'
import { useDocumentDrawer } from '@payloadcms/ui'
import { metadataPatch } from '@/lib/metadata/apply'
import { workTypes, type MetadataCandidate, type SearchResult, type WorkType } from '@/lib/metadata/types'
import { dictionaries } from '@/lib/ui/dictionary'
import type { TableWork } from '@/lib/works-table'
import { tableRequest } from './works-table-api'

export function AddWorkDialog({ status, works, onWork, onClose }: {
  status: 'completed' | 'planned'; works: TableWork[]; onWork: (work: TableWork) => void; onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [type, setType] = useState<WorkType>('game')
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<SearchResult>()
  const [searchedQuery, setSearchedQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const [ManualDrawer, , manual] = useDocumentDrawer({ collectionSlug: 'works' })
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    dialog.current?.showModal()
    return () => { active.current = false }
  }, [])
  useEffect(() => {
    if (!manual.isDrawerOpen && active.current && !dialog.current?.open) dialog.current?.showModal()
  }, [manual.isDrawerOpen])

  async function search() {
    setBusy(true); setMessage(''); setResult(undefined)
    try {
      const data = await tableRequest<SearchResult>(`metadata/search?${new URLSearchParams({ type, q: query.trim() })}`)
      if (active.current) { setResult(data); setSearchedQuery(query.trim()) }
    } catch (error) { if (active.current) setMessage((error as Error).message) }
    finally { if (active.current) setBusy(false) }
  }

  async function add(candidate: MetadataCandidate) {
    const existing = works.find(work => work.sources?.some(source => source.provider === candidate.provider && source.externalId === candidate.externalId))
    if (existing) { onWork(existing); onClose(); return }
    setBusy(true); setMessage('')
    let creating = false
    try {
      let selected = candidate
      let detailMissing = false
      try {
        const details = await tableRequest<{ candidate: MetadataCandidate; state: string }>(`metadata/details?${new URLSearchParams({ type, q: searchedQuery, provider: candidate.provider, id: candidate.externalId })}`)
        if (details.candidate) selected = details.candidate
        detailMissing = details.state !== 'ok'
      } catch { detailMissing = true }
      const data = { ...metadataPatch(selected, {}), type, status, visibility: 'private' as const }
      const duplicate = await tableRequest<{ docs: TableWork[] }>(`works?${new URLSearchParams({ 'where[slug][equals]': data.slug, depth: '0', limit: '1' })}`)
      if (duplicate.docs.length) {
        const match = duplicate.docs[0]
        if (match.sources?.some(source => source.provider === candidate.provider && source.externalId === candidate.externalId)) { onWork(match); onClose(); return }
        throw Error('同名作品已存在，请先核对；不同版本可通过手动添加设置不同固定链接。')
      }
      if (detailMissing) {
        setMessage('来源详情暂时不可用，本次只收录搜索结果中的基础资料。')
      }
      creating = true
      const saved = await tableRequest<{ doc: TableWork }>('works?depth=0', 'POST', data)
      onWork(saved.doc); onClose()
    } catch (error) {
      if (creating) setUncertain(true)
      setMessage(creating ? `${(error as Error).message} 创建结果需核对，请关闭弹窗并刷新列表，避免重复创建。` : (error as Error).message)
    } finally { if (active.current) setBusy(false) }
  }

  return <>
    <dialog ref={dialog} className="works-table__dialog" onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
      <h2>{status === 'completed' ? '记录作品' : '加入待体验'}</h2>
      <p>搜索外部作品资料；选择后保存为私密作品。已有作品会定位到原记录。</p>
      <div className="works-table__toolbar">
        <select aria-label="新增作品类型" value={type} disabled={busy || uncertain} onChange={event => { setType(event.target.value as WorkType); setResult(undefined) }}>
          {workTypes.map(value => <option key={value} value={value}>{dictionaries.zh[value]}</option>)}
        </select>
        <input aria-label="搜索外部作品" value={query} maxLength={100} disabled={busy || uncertain} placeholder="输入作品名称"
          onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && query.trim().length >= 2 && !busy) void search() }} />
        <button type="button" disabled={busy || uncertain || query.trim().length < 2} onClick={() => void search()}>搜索作品</button>
      </div>
      <p role="status">{busy ? '处理中…' : message}</p>
      {result && <>
        {result.providers.filter(provider => provider.state !== 'ok').map(provider => <p key={provider.provider}>{provider.provider}：{provider.message || dictionaries.zh.providerError}</p>)}
        {!result.candidates.length && <p>没有搜索结果，可以手动添加。</p>}
        <ul className="works-table__candidates">{result.candidates.map(candidate => <li key={`${candidate.provider}:${candidate.externalId}`}>
          {candidate.coverUrl && <img src={candidate.coverUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />}
          <span><strong>{candidate.title}</strong><br />{candidate.releaseDate?.slice(0, 4)} · {candidate.provider}</span>
          <button type="button" disabled={busy || uncertain} onClick={() => void add(candidate)}>添加 {candidate.title}</button>
        </li>)}</ul>
      </>}
      <div className="works-table__actions">
        <button type="button" disabled={busy || uncertain} onClick={() => { dialog.current?.close(); manual.openDrawer() }}>手动添加</button>
        <button type="button" disabled={busy} onClick={onClose}>关闭</button>
      </div>
    </dialog>
    <ManualDrawer redirectAfterCreate={false} redirectAfterDuplicate={false} initialData={{ title: query.trim(), type, status, visibility: 'private' }} onSave={async ({ doc }) => {
      const saved = await tableRequest<TableWork>(`works/${doc.id}?depth=0`)
      onWork(saved); manual.closeDrawer(); onClose()
    }} />
  </>
}
