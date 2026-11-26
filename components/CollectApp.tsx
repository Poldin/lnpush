'use client'

import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent } from 'react'

import {
  clampGooglePages,
  companyGoogleQuery,
  DEFAULT_GOOGLE_PAGES,
  googlePagesCaption,
  googleSearchWindowHrefs,
  GOOGLE_PAGE_PRESETS,
  GOOGLE_PAGES_STORAGE_KEY,
  importFeedback,
  MAX_GOOGLE_PAGES,
  MIN_GOOGLE_PAGES,
  nextPendingAfter,
  openGoogleWindows,
  PASTE_KEYBOARD_HINT,
  pasteFeedback,
  popupBlockedMessage,
  readStoredGooglePages,
  SEARCH_PRESETS,
  shouldRefocusPaste,
  type QueueCompany,
  type QueueProgress,
} from '../lib/collectQueue'
import type { SavedProfile } from '../lib/collectContacts'

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
  profiles?: SavedProfile[]
  error?: string
}

export function CollectApp({
  companies: initialCompanies,
  progress: initialProgress,
}: {
  companies: QueueCompany[]
  progress: QueueProgress
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
  const [saved, setSaved] = useState<SavedProfile[]>([])
  const [savedCompanyId, setSavedCompanyId] = useState<string | null>(null)
  const [removingIds, setRemovingIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [opened, setOpened] = useState<Set<string>>(new Set())
  const [pages, setPages] = useState(DEFAULT_GOOGLE_PAGES)
  const [pagesDraft, setPagesDraft] = useState(String(DEFAULT_GOOGLE_PAGES))
  const [popupBlocked, setPopupBlocked] = useState(false)
  const pasteChain = useRef(Promise.resolve())
  const removing = useRef(new Set<string>())
  const pasteRef = useRef<HTMLTextAreaElement>(null)
  const focusPaste = useRef(false)
  const activeRef = useRef<QueueCompany | null>(null)
  const busyRef = useRef(false)
  const finishRef = useRef<() => void>(() => {})

  const active = companies.find((company) => company.id === activeId) ?? null
  const visible = companies.filter((company) => company.status === filter)
  activeRef.current = active
  busyRef.current = busy

  useEffect(() => {
    setOpened(readOpened())
    const stored = readPages()
    setPages(stored)
    setPagesDraft(String(stored))
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

  useEffect(() => {
    let windowFocused = document.hasFocus()

    function onFocus() {
      const returned = !windowFocused
      windowFocused = true
      if (returned) focusPasteIfIdle()
    }

    function onBlur() {
      windowFocused = false
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') focusPasteIfIdle()
    }

    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Enter' || event.repeat) return
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
      if (!activeRef.current || busyRef.current) return
      event.preventDefault()
      finishRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function applyQueue(data: QueueResponse) {
    setCompanies(data.companies)
    setProgress(data.progress)
  }

  function remember(companyId: string, presetId: string) {
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
    if (!active || busy) return
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
      setSavedCompanyId(null)
    } catch (error) {
      setQueueMessage(error instanceof Error ? error.message : 'Could not update the company.')
    } finally {
      setBusy(false)
    }
  }

  finishRef.current = () => {
    void finish()
  }

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const html = event.clipboardData.getData('text/html')
    const text = event.clipboardData.getData('text/plain')
    event.preventDefault()
    event.currentTarget.value = ''
    event.currentTarget.focus()
    if (!active) return
    const companyId = active.id
    pasteChain.current = pasteChain.current
      .then(() => sendPaste(companyId, html, text))
      .catch(() => undefined)
  }

  async function sendPaste(companyId: string, html: string, text: string) {
    setPasteMessage('Saving…')
    setSaved([])
    setSavedCompanyId(companyId)
    try {
      const response = await fetch('/api/collect/paste', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ companyId, html, text }),
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
      setSavedCompanyId(companyId)
      if (added > 0) {
        setCompanies((current) =>
          current.map((company) => (company.id === companyId ? { ...company, profiles: company.profiles + added } : company)),
        )
      }
    } catch {
      setPasteMessage('Could not save profiles.')
    } finally {
      focusPasteIfIdle()
    }
  }

  async function removeSaved(id: string, companyId: string | null) {
    if (removing.current.has(id)) return
    removing.current.add(id)
    setRemovingIds((current) => [...current, id])
    try {
      const response = await fetch('/api/collect/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id }),
      })
      const data = (await response.json()) as { error?: string }
      if (!response.ok && response.status !== 404) {
        setPasteMessage(data.error ?? 'Could not remove the contact.')
        return
      }
      setSaved((current) => current.filter((profile) => profile.id !== id))
      if (companyId) {
        setCompanies((current) =>
          current.map((company) =>
            company.id === companyId ? { ...company, profiles: Math.max(0, company.profiles - 1) } : company,
          ),
        )
      }
    } catch {
      setPasteMessage('Could not remove the contact.')
    } finally {
      removing.current.delete(id)
      setRemovingIds((current) => current.filter((item) => item !== id))
    }
  }

  function selectPages(next: number) {
    const clamped = clampGooglePages(next)
    setPages(clamped)
    setPagesDraft(String(clamped))
    writePages(clamped)
  }

  function openSearch(companyId: string, presetId: string, query: string) {
    const urls = googleSearchWindowHrefs(query, pages)
    const result = openGoogleWindows(urls, (url, target, features) => window.open(url, target, features))
    remember(companyId, presetId)
    setPopupBlocked(result.blocked)
  }

  function openCustom(event: FormEvent) {
    event.preventDefault()
    if (!active || !keyword.trim()) return
    openSearch(active.id, `custom:${keyword.trim().toLocaleLowerCase('en')}`, customQuery)
  }

  const customQuery = active ? companyGoogleQuery(active.name, keyword) : ''
  const customKey = active ? `${active.id}:custom:${keyword.trim().toLocaleLowerCase('en')}` : ''

  function focusPasteIfIdle() {
    const paste = pasteRef.current
    if (!paste || !activeRef.current) return
    const current = document.activeElement
    const editable =
      current instanceof Element
        ? { tagName: current.tagName, isContentEditable: current instanceof HTMLElement && current.isContentEditable }
        : null
    if (!shouldRefocusPaste(editable, current === paste)) return
    paste.focus()
  }

  return (
    <main className="collect-screen">
      <div className="collect-wrap">
        <nav className="collect-nav" aria-label="Sections">
          <a href="/">List</a>
        </nav>
        <p className="kicker">Collect</p>
        <h1 className="plain-title">Google profiles</h1>
        <p className="collect-progress">
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
                <div className="collect-pages">
                  <label htmlFor="google-pages">Pages</label>
                  <div className="collect-stepper" role="group" aria-label="Google result pages">
                    <button
                      type="button"
                      aria-label="Fewer pages"
                      disabled={pages <= MIN_GOOGLE_PAGES}
                      onClick={() => selectPages(pages - 1)}
                    >
                      −
                    </button>
                    <input
                      id="google-pages"
                      type="number"
                      inputMode="numeric"
                      min={MIN_GOOGLE_PAGES}
                      max={MAX_GOOGLE_PAGES}
                      value={pagesDraft}
                      aria-label="Number of Google result pages"
                      onChange={(event) => {
                        const raw = event.target.value
                        setPagesDraft(raw)
                        if (raw.trim() === '') return
                        const parsed = Number(raw)
                        if (!Number.isFinite(parsed)) return
                        const clamped = clampGooglePages(parsed)
                        setPages(clamped)
                        writePages(clamped)
                        if (clamped !== parsed) setPagesDraft(String(clamped))
                      }}
                      onBlur={() => selectPages(pagesDraft.trim() === '' ? pages : Number(pagesDraft))}
                    />
                    <button
                      type="button"
                      aria-label="More pages"
                      disabled={pages >= MAX_GOOGLE_PAGES}
                      onClick={() => selectPages(pages + 1)}
                    >
                      +
                    </button>
                  </div>
                  <div className="collect-page-presets" role="group" aria-label="Page shortcuts">
                    {GOOGLE_PAGE_PRESETS.map((count) => (
                      <button
                        key={count}
                        type="button"
                        className={pages === count ? 'on' : undefined}
                        aria-pressed={pages === count}
                        aria-label={count === 1 ? '1 page' : `${count} pages`}
                        onClick={() => selectPages(count)}
                      >
                        {count}
                      </button>
                    ))}
                  </div>
                  <p className="collect-hint">{googlePagesCaption(pages)}</p>
                </div>
                <div className="collect-search-row">
                  {SEARCH_PRESETS.map((preset) => {
                    const query = companyGoogleQuery(active.name, preset.keywords)
                    const key = `${active.id}:${preset.id}`
                    const marked = opened.has(key)
                    const pageLabel = pages === 1 ? '1 page' : `${pages} pages`
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        className={marked ? 'collect-search on' : 'collect-search'}
                        aria-label={`${preset.label}, open ${pageLabel}`}
                        onClick={() => openSearch(active.id, preset.id, query)}
                      >
                        {preset.label}
                        <span className="collect-pages-count">{pageLabel}</span>
                        {marked ? <span className="collect-mark">Opened</span> : null}
                      </button>
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
                    <button
                      className={keyword.trim() && opened.has(customKey) ? 'collect-search on' : 'collect-search'}
                      type="submit"
                      disabled={!keyword.trim()}
                      aria-label={
                        keyword.trim()
                          ? `Search, open ${pages === 1 ? '1 page' : `${pages} pages`}`
                          : 'Search'
                      }
                    >
                      Search
                      {keyword.trim() ? (
                        <span className="collect-pages-count">{pages === 1 ? '1 page' : `${pages} pages`}</span>
                      ) : null}
                      {keyword.trim() && opened.has(customKey) ? <span className="collect-mark">Opened</span> : null}
                    </button>
                  </div>
                </form>
                {popupBlocked ? (
                  <p className="collect-banner" role="status">
                    {popupBlockedMessage()}
                  </p>
                ) : null}
                <label htmlFor="paste-zone">Paste Google results for {active.name}</label>
                <p className="collect-hint">{PASTE_KEYBOARD_HINT}</p>
                <textarea
                  id="paste-zone"
                  ref={pasteRef}
                  className="collect-paste"
                  rows={8}
                  placeholder="Paste a Google results page. The box clears so you can paste the next one."
                  onPaste={onPaste}
                />
                <p className="collect-note" role="status">
                  {pasteMessage}
                </p>
                {saved.length > 0 ? (
                  <ul className="collect-saved">
                    {saved.map((profile) => (
                      <li key={profile.id}>
                        <a href={profile.linkedin_url} target="_blank" rel="noopener noreferrer">
                          {profile.full_name || 'Unnamed profile'}
                        </a>
                        {profile.headline ? <span>{profile.headline}</span> : null}
                        <button
                          className="collect-remove"
                          type="button"
                          disabled={removingIds.includes(profile.id)}
                          aria-label={`Remove ${profile.full_name || 'profile'}`}
                          onClick={() => void removeSaved(profile.id, savedCompanyId)}
                        >
                          Remove
                        </button>
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

function readPages(): number {
  try {
    return readStoredGooglePages(localStorage.getItem(GOOGLE_PAGES_STORAGE_KEY))
  } catch {
    return DEFAULT_GOOGLE_PAGES
  }
}

function writePages(pages: number) {
  try {
    localStorage.setItem(GOOGLE_PAGES_STORAGE_KEY, String(pages))
  } catch {
    // The page count falls back to the default on the next visit.
  }
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
