'use client'

import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent } from 'react'

import {
  companyGoogleQuery,
  googleSearchHref,
  importFeedback,
  nextPendingAfter,
  pasteFeedback,
  SEARCH_PRESETS,
  type QueueCompany,
  type QueueProgress,
} from '../lib/collectQueue'
import type { ParsedProfile } from '../lib/googlePaste'

const OPENED_KEY = 'lnpush.collect.opened.v1'

type QueueResponse = {
  companies: QueueCompany[]
  progress: QueueProgress
  added?: number
  skipped?: number
  error?: string
}

type PasteResponse = {
  added?: number
  skipped?: number
  empty?: boolean
  profiles?: ParsedProfile[]
  error?: string
}

export function CollectApp({
  companies: initialCompanies,
  progress: initialProgress,
  isAdmin,
}: {
  companies: QueueCompany[]
  progress: QueueProgress
  isAdmin: boolean
}) {
  const [companies, setCompanies] = useState(initialCompanies)
  const [progress, setProgress] = useState(initialProgress)
  const [filter, setFilter] = useState<'pending' | 'done'>('pending')
  const [activeId, setActiveId] = useState<string | null>(
    initialCompanies.find((company) => company.status === 'pending')?.id ?? initialCompanies[0]?.id ?? null,
  )
  const [importText, setImportText] = useState('')
  const [singleName, setSingleName] = useState('')
  const [keyword, setKeyword] = useState('')
  const [queueMessage, setQueueMessage] = useState('')
  const [pasteMessage, setPasteMessage] = useState('')
  const [saved, setSaved] = useState<ParsedProfile[]>([])
  const [busy, setBusy] = useState(false)
  const [opened, setOpened] = useState<Set<string>>(new Set())
  const sourceQuery = useRef('')
  const pasteChain = useRef(Promise.resolve())
  const pasteRef = useRef<HTMLTextAreaElement>(null)
  const customLinkRef = useRef<HTMLAnchorElement>(null)
  const focusPaste = useRef(false)

  const active = companies.find((company) => company.id === activeId) ?? null
  const visible = companies.filter((company) => company.status === filter)

  useEffect(() => {
    setOpened(readOpened())
  }, [])

  useEffect(() => {
    if (companies.length === 0) {
      if (activeId !== null) setActiveId(null)
      return
    }
    if (activeId && companies.some((company) => company.id === activeId)) return
    setActiveId(companies.find((company) => company.status === 'pending')?.id ?? companies[0]?.id ?? null)
  }, [companies, activeId])

  useEffect(() => {
    if (!focusPaste.current) return
    focusPaste.current = false
    pasteRef.current?.focus()
  }, [activeId])

  function applyQueue(data: QueueResponse) {
    setCompanies(data.companies)
    setProgress(data.progress)
  }

  function remember(companyId: string, presetId: string, query: string) {
    sourceQuery.current = query
    setOpened((current) => {
      const next = new Set(current)
      next.add(`${companyId}:${presetId}`)
      writeOpened(next)
      return next
    })
  }

  async function postQueue(body: unknown): Promise<QueueResponse> {
    const response = await fetch('/api/collect/companies', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await response.json()) as QueueResponse
    if (!response.ok) throw new Error(data.error ?? 'Could not update the queue.')
    return data
  }

  async function importList(event: FormEvent) {
    event.preventDefault()
    const text = importText
    if (!text.trim()) return
    setBusy(true)
    setQueueMessage('')
    try {
      const data = await postQueue({ action: 'import', text })
      applyQueue(data)
      setImportText('')
      setQueueMessage(importFeedback(data.added ?? 0, data.skipped ?? 0))
      setFilter('pending')
    } catch (error) {
      setQueueMessage(error instanceof Error ? error.message : 'Could not add companies.')
    } finally {
      setBusy(false)
    }
  }

  async function addOne(event: FormEvent) {
    event.preventDefault()
    const name = singleName
    if (!name.trim()) return
    setBusy(true)
    setQueueMessage('')
    try {
      const data = await postQueue({ action: 'add', name })
      applyQueue(data)
      setSingleName('')
      setQueueMessage(importFeedback(data.added ?? 0, data.skipped ?? 0))
      setFilter('pending')
      const added = data.companies.find((company) => company.name.toLocaleLowerCase('en') === name.trim().toLocaleLowerCase('en'))
      if (added && (data.added ?? 0) > 0) setActiveId(added.id)
    } catch (error) {
      setQueueMessage(error instanceof Error ? error.message : 'Could not add the company.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    setBusy(true)
    setQueueMessage('')
    try {
      const data = await postQueue({ action: 'delete', id })
      applyQueue(data)
      setQueueMessage('Company deleted.')
    } catch (error) {
      setQueueMessage(error instanceof Error ? error.message : 'Could not delete the company.')
    } finally {
      setBusy(false)
    }
  }

  async function reopen(id: string) {
    setBusy(true)
    setQueueMessage('')
    try {
      const data = await postQueue({ action: 'reopen', id })
      applyQueue(data)
      setFilter('pending')
      setActiveId(id)
      setQueueMessage('Company reopened.')
    } catch (error) {
      setQueueMessage(error instanceof Error ? error.message : 'Could not reopen the company.')
    } finally {
      setBusy(false)
    }
  }

  async function finish() {
    if (!active) return
    const nextId = nextPendingAfter(companies, active.id)
    setBusy(true)
    setQueueMessage('')
    try {
      const data = await postQueue({ action: 'done', id: active.id })
      applyQueue(data)
      setFilter(nextId ? 'pending' : 'done')
      setActiveId(nextId ?? active.id)
      if (nextId) focusPaste.current = true
      setPasteMessage('')
      setSaved([])
      sourceQuery.current = ''
    } catch (error) {
      setQueueMessage(error instanceof Error ? error.message : 'Could not update the company.')
    } finally {
      setBusy(false)
    }
  }

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const html = event.clipboardData.getData('text/html')
    const text = event.clipboardData.getData('text/plain')
    event.preventDefault()
    event.currentTarget.value = ''
    if (!active) return
    const companyId = active.id
    const query = sourceQuery.current
    pasteChain.current = pasteChain.current
      .then(() => sendPaste(companyId, html, text, query))
      .catch(() => undefined)
  }

  async function sendPaste(companyId: string, html: string, text: string, query: string) {
    setPasteMessage('Saving…')
    setSaved([])
    try {
      const response = await fetch('/api/collect/paste', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ companyId, html, text, sourceQuery: query }),
      })
      const data = (await response.json()) as PasteResponse
      if (!response.ok) {
        setPasteMessage(data.error ?? 'Could not save profiles.')
        return
      }
      const added = data.added ?? 0
      const skipped = data.skipped ?? 0
      setPasteMessage(pasteFeedback(added, skipped, data.empty === true))
      setSaved(data.profiles ?? [])
      if (added > 0) {
        setCompanies((current) =>
          current.map((company) => (company.id === companyId ? { ...company, profiles: company.profiles + added } : company)),
        )
      }
    } catch {
      setPasteMessage('Could not save profiles.')
    }
  }

  function openCustom(event: FormEvent) {
    event.preventDefault()
    if (!keyword.trim()) return
    customLinkRef.current?.click()
  }

  const customQuery = active ? companyGoogleQuery(active.name, keyword) : ''
  const customKey = active ? `${active.id}:custom:${keyword.trim().toLocaleLowerCase('en')}` : ''

  return (
    <main className="collect-screen">
      <div className="collect-wrap">
        <nav className="collect-nav" aria-label="Sections">
          <a href="/">List</a>
          {isAdmin ? <a href="/review">Review</a> : null}
        </nav>
        <p className="kicker">Collect</p>
        <h1 className="plain-title">Google profiles</h1>
        <p className="review-progress">
          {progress.pending} pending · {progress.done} done
        </p>
        <div className="collect-layout">
          <aside className="collect-side" aria-label="Company queue">
            <form onSubmit={(event) => void importList(event)}>
              <label htmlFor="company-list">Companies, one per line</label>
              <textarea
                id="company-list"
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                rows={5}
                placeholder={'Acme\nBeta Industries'}
                disabled={busy}
              />
              <button className="ghost" type="submit" disabled={busy || !importText.trim()}>
                Add list
              </button>
            </form>
            <form onSubmit={(event) => void addOne(event)}>
              <label htmlFor="company-name">One company</label>
              <div className="collect-add">
                <input
                  id="company-name"
                  value={singleName}
                  onChange={(event) => setSingleName(event.target.value)}
                  placeholder="Company name"
                  disabled={busy}
                  autoComplete="off"
                />
                <button className="ghost" type="submit" disabled={busy || !singleName.trim()}>
                  Add
                </button>
              </div>
            </form>
            <p className="collect-note" role="status">
              {queueMessage}
            </p>
            <div className="collect-switch" role="tablist" aria-label="Queue">
              <button
                className={filter === 'pending' ? 'collect-filter on' : 'collect-filter'}
                type="button"
                role="tab"
                aria-selected={filter === 'pending'}
                onClick={() => setFilter('pending')}
              >
                Pending
              </button>
              <button
                className={filter === 'done' ? 'collect-filter on' : 'collect-filter'}
                type="button"
                role="tab"
                aria-selected={filter === 'done'}
                onClick={() => setFilter('done')}
              >
                Done
              </button>
            </div>
            {visible.length === 0 ? <p className="collect-note">No {filter} companies.</p> : null}
            <ul className="collect-list">
              {visible.map((company) => (
                <li key={company.id} className="collect-row">
                  <button
                    className={company.id === activeId ? 'collect-pick on' : 'collect-pick'}
                    type="button"
                    aria-current={company.id === activeId ? 'true' : undefined}
                    onClick={() => setActiveId(company.id)}
                  >
                    <span className="collect-pick-name">{company.name}</span>
                    <span className="collect-count" title="Profiles collected">
                      {company.profiles}
                    </span>
                  </button>
                  {company.status === 'done' ? (
                    <button className="collect-mini" type="button" disabled={busy} onClick={() => void reopen(company.id)}>
                      Reopen
                    </button>
                  ) : null}
                  <button className="collect-mini" type="button" disabled={busy} onClick={() => void remove(company.id)}>
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </aside>
          <section className="collect-work" aria-label={active ? active.name : 'No company selected'}>
            {active ? (
              <>
                <p className="kicker">Active company</p>
                <h2 className="collect-active-name">{active.name}</h2>
                <p className="collect-note">
                  {active.profiles} {active.profiles === 1 ? 'profile' : 'profiles'} collected
                  {active.status === 'done' ? ' · done' : ''}
                </p>
                <div className="collect-search-row">
                  {SEARCH_PRESETS.map((preset) => {
                    const query = companyGoogleQuery(active.name, preset.keywords)
                    const key = `${active.id}:${preset.id}`
                    const marked = opened.has(key)
                    return (
                      <a
                        key={preset.id}
                        className={marked ? 'collect-search on' : 'collect-search'}
                        href={googleSearchHref(query)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => remember(active.id, preset.id, query)}
                      >
                        {preset.label}
                        {marked ? <span className="collect-mark">Opened</span> : null}
                      </a>
                    )
                  })}
                </div>
                <form className="collect-custom" onSubmit={openCustom}>
                  <label htmlFor="custom-keyword">Custom keyword</label>
                  <div className="collect-add">
                    <input
                      id="custom-keyword"
                      value={keyword}
                      onChange={(event) => setKeyword(event.target.value)}
                      placeholder="thermal, buyer, Italy…"
                      autoComplete="off"
                    />
                    <a
                      ref={customLinkRef}
                      className={keyword.trim() && opened.has(customKey) ? 'collect-search on' : 'collect-search'}
                      href={keyword.trim() ? googleSearchHref(customQuery) : '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-disabled={keyword.trim() ? undefined : true}
                      onClick={(event) => {
                        if (!keyword.trim()) {
                          event.preventDefault()
                          return
                        }
                        remember(active.id, `custom:${keyword.trim().toLocaleLowerCase('en')}`, customQuery)
                      }}
                    >
                      Search
                      {keyword.trim() && opened.has(customKey) ? <span className="collect-mark">Opened</span> : null}
                    </a>
                  </div>
                </form>
                <label htmlFor="paste-zone">Paste Google results for {active.name}</label>
                <textarea
                  id="paste-zone"
                  ref={pasteRef}
                  className="collect-paste"
                  rows={8}
                  placeholder="On the Google results page: Ctrl+A, Ctrl+C. Click here and Ctrl+V. The box clears so you can paste the next page."
                  onPaste={onPaste}
                />
                <p className="collect-note" role="status">
                  {pasteMessage}
                </p>
                {saved.length > 0 ? (
                  <ul className="collect-saved">
                    {saved.map((profile) => (
                      <li key={profile.linkedin_url}>
                        <a href={profile.linkedin_url} target="_blank" rel="noopener noreferrer">
                          {profile.full_name || 'Unnamed profile'}
                        </a>
                        {profile.headline ? <span>{profile.headline}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="collect-finish">
                  {active.status === 'done' ? (
                    <button className="ghost" type="button" disabled={busy} onClick={() => void reopen(active.id)}>
                      Reopen
                    </button>
                  ) : null}
                  <button className="primary" type="button" disabled={busy} onClick={() => void finish()}>
                    Done → Next company
                  </button>
                </div>
              </>
            ) : (
              <p className="lede">Add a company, then search Google and paste the results.</p>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}

function readOpened(): Set<string> {
  try {
    const raw = sessionStorage.getItem(OPENED_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((item): item is string => typeof item === 'string'))
  } catch {
    return new Set()
  }
}

function writeOpened(opened: Set<string>) {
  try {
    sessionStorage.setItem(OPENED_KEY, JSON.stringify([...opened]))
  } catch {
    // The marks are only a session aid. The queue itself is in the database.
  }
}
