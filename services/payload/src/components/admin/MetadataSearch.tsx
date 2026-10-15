'use client'

import { useEffect, useRef, useState } from 'react'
import { useForm, useFormFields, useTranslation } from '@payloadcms/ui'
import type { FormState } from 'payload'
import { metadataPatch } from '@/lib/metadata/apply'
import type { MetadataCandidate, SearchResult, WorkType, ProviderState } from '@/lib/metadata/types'
import './metadata.css'
import { dictionaries, uiLabel } from '@/lib/ui/dictionary'

export function MetadataSearch() {
  const type = useFormFields(([fields]) => fields.type?.value)
  return typeof type === 'string' ? <SearchForm key={type} type={type as WorkType} /> : null
}

function SearchForm({ type }: { type: WorkType }) {
  const { i18n } = useTranslation()
  const t = dictionaries[i18n.language === 'zh' ? 'zh' : 'en']
  const { getData, getFields, dispatchFields, setModified } = useForm()
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<SearchResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const requestId = useRef(0)
  const resultQuery = useRef('')
  useEffect(() => () => { requestId.current++ }, [])
  const label = type === 'game' ? t.searchGames : `${t.searchWorks} · ${uiLabel(i18n.language === 'zh' ? 'zh' : 'en', type)}`
  const providerMessage = (state: ProviderState) => state === 'unavailable' ? t.unavailable : state === 'rate-limited' ? t.rateLimited : state === 'upgrade-required' ? t.upgradeRequired : t.providerError

  async function search() {
    const id = ++requestId.current
    setBusy(true); setMessage(''); setResult(null)
    const searchType = type
    const searchQuery = query.trim()
    try {
      const response = await fetch(`/api/metadata/search?type=${encodeURIComponent(String(searchType))}&q=${encodeURIComponent(searchQuery)}`, { credentials: 'same-origin' })
      if (!response.ok) throw new Error(response.status === 401 ? t.expired : t.searchFailed)
      const data: SearchResult = await response.json()
      if (id === requestId.current) { resultQuery.current = searchQuery; setResult(data) }
    } catch (error) { if (id === requestId.current) setMessage(error instanceof Error ? error.message : t.searchFailed) }
    finally { if (id === requestId.current) setBusy(false) }
  }

  async function apply(selected: MetadataCandidate) {
    const id = ++requestId.current
    setBusy(true); setMessage('')
    let candidate = selected
    let detailFailed = false
    try {
      const params = new URLSearchParams({ type: selected.type, q: resultQuery.current, provider: selected.provider, id: selected.externalId })
      const response = await fetch(`/api/metadata/details?${params}`, { credentials: 'same-origin' })
      if (response.status === 401) { if (id === requestId.current) { setMessage(t.expired); setBusy(false) }; return }
      if (!response.ok) throw new Error('Details unavailable')
      const data: { candidate: MetadataCandidate; state: ProviderState } = await response.json()
      if (data.state === 'upgrade-required') { if (id === requestId.current) { setMessage(t.upgradeRequired); setBusy(false) }; return }
      candidate = data.candidate
      detailFailed = data.state !== 'ok'
    } catch { detailFailed = true }
    if (id !== requestId.current) return
    setBusy(false)
    const current = getData()
    if (current.type !== selected.type || candidate.type !== selected.type) return
    const { sources, ...values } = metadataPatch(candidate, current)
    // Update Payload's native field state atomically. A full async reset races with
    // the form's background server validation and can return an aborted state.
    const state: FormState = { ...getFields() }
    for (const [path, value] of Object.entries(values)) {
      state[path] = { ...state[path], value, valid: true, errorMessage: undefined }
    }
    for (const path of Object.keys(state)) if (path.startsWith('sources.')) delete state[path]
    const rows = sources.map(source => ({ ...source, id: crypto.randomUUID() }))
    state.sources = { ...state.sources, disableFormData: true, value: rows.length, rows: rows.map(row => ({ id: row.id, collapsed: false })), valid: true }
    rows.forEach((row, index) => {
      for (const [key, value] of Object.entries(row)) {
        state[`sources.${index}.${key}`] = { value, initialValue: value, valid: true }
      }
    })
    dispatchFields({ type: 'REPLACE_STATE', state })
    setModified(true)
    setMessage(`${detailFailed ? t.detailFailed : t.applied} ${candidate.title}`)
    setResult(null)
  }

  return <section className="metadata-search" aria-label={t.metadataSearch}>
    <label htmlFor="metadata-search">{label}</label>
    <div className="metadata-search__input">
      <input id="metadata-search" value={query} maxLength={100} placeholder={type === 'game' ? 'TUNIC' : type === 'book' ? '三体 / ISBN' : uiLabel(i18n.language === 'zh' ? 'zh' : 'en', type as WorkType)} disabled={busy}
        onChange={event => setQuery(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (query.trim().length >= 2 && !busy) void search() } }} />
      <button type="button" disabled={busy || query.trim().length < 2} onClick={() => void search()}>{busy ? t.searching : t.search}</button>
    </div>
    <p className="metadata-search__hint">{t.searchHint}</p>
    <div role="status" aria-live="polite">{message}</div>
    {result && <>
      {result.providers.filter(p => p.state !== 'ok').map(p => <p key={p.provider}>{p.provider.toUpperCase()}：{providerMessage(p.state)}</p>)}
      {result.candidates.length === 0 && <p>{t.noResults}</p>}
      <ul className="metadata-search__results">{result.candidates.map(candidate => <li key={`${candidate.provider}:${candidate.externalId}`}>
        {candidate.coverUrl && <img src={candidate.coverUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />}
        <div><strong>{candidate.title}</strong><p>{candidate.releaseDate?.slice(0, 10)} · {candidate.provider.toUpperCase()}</p></div>
        <button type="button" disabled={busy} onClick={() => void apply(candidate)}>{t.choose} {candidate.title}</button>
      </li>)}</ul>
    </>}
  </section>
}
