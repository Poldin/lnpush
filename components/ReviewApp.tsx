'use client'

import { useMemo, useState } from 'react'

import { groupCandidates, type ReviewCandidate, type ReviewProgress } from '../lib/review'

export function ReviewApp({
  pending,
  progress,
  providerEnabled,
}: {
  pending: ReviewCandidate[]
  progress: ReviewProgress
  providerEnabled: boolean
}) {
  const [rows, setRows] = useState(pending)
  const [stats, setStats] = useState(progress)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [collecting, setCollecting] = useState(false)
  const [message, setMessage] = useState('')
  const groups = useMemo(() => groupCandidates(rows), [rows])

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function reload() {
    const response = await fetch('/api/review')
    if (!response.ok) return
    const data = (await response.json()) as { pending: ReviewCandidate[]; progress: ReviewProgress }
    setRows(data.pending)
    setStats(data.progress)
    setSelected(new Set())
  }

  async function review(action: 'approve' | 'reject', target: { ids: string[] } | { company: string }) {
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch('/api/review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ...target }),
      })
      const data = (await response.json()) as { ids?: string[]; error?: string }
      if (!response.ok) {
        setMessage(data.error ?? 'Could not update the selection.')
        if (data.ids?.length) setRows((current) => current.filter((row) => !data.ids?.includes(row.id)))
        return
      }
      const ids = new Set(data.ids ?? [])
      setRows((current) => current.filter((row) => !ids.has(row.id)))
      setSelected(new Set())
    } catch {
      setMessage('Could not update the selection.')
    } finally {
      setBusy(false)
    }
  }

  async function collectAll() {
    setCollecting(true)
    setMessage('Collecting… keep this page open.')
    let previousKey = ''
    let previousDone = stats.done
    try {
      for (let guard = 0; guard < 200; guard += 1) {
        const response = await fetch('/api/collect/run', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ next: 20, save: true, limit: 60 }),
        })
        const data = (await response.json()) as {
          ok?: boolean
          error?: string
          remaining?: string[]
          results?: { company: string; saved?: number }[]
          progress?: ReviewProgress
        }
        if (!response.ok) {
          setMessage(data.error ?? 'Collection failed.')
          break
        }
        if (data.progress) {
          setStats(data.progress)
          setMessage(
            `Collecting… ${data.progress.done} / ${data.progress.total} companies · ${data.progress.candidates} candidates. Keep this page open.`,
          )
        }
        if (!data.ok) {
          setMessage(data.error ?? 'Collection stopped.')
          break
        }
        const names = (data.results ?? []).map((item) => item.company).join('|')
        const done = data.progress?.done ?? previousDone
        if (names && names === previousKey && done === previousDone) {
          setMessage('Collection stopped because progress did not advance.')
          break
        }
        previousKey = names
        previousDone = done
        const remaining = data.remaining ?? []
        if ((data.results ?? []).length === 0 && remaining.length === 0) {
          setMessage('Collection finished.')
          break
        }
        if (data.progress && data.progress.done >= data.progress.total && remaining.length === 0) {
          setMessage('Collection finished.')
          break
        }
      }
    } catch {
      setMessage('Collection failed.')
    } finally {
      setCollecting(false)
      await reload().catch(() => undefined)
    }
  }

  async function recollect(company: string) {
    setCollecting(true)
    setMessage(`Collecting ${company}…`)
    try {
      const response = await fetch('/api/collect/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ company, force: true, save: true, limit: 60 }),
      })
      const data = (await response.json()) as { error?: string; ok?: boolean }
      if (!response.ok || data.ok === false) setMessage(data.error ?? 'Re-collect failed.')
      else setMessage(`Finished ${company}.`)
    } catch {
      setMessage('Re-collect failed.')
    } finally {
      setCollecting(false)
      await reload().catch(() => undefined)
    }
  }

  const locked = busy || collecting

  return (
    <main className="review-screen">
      <div className="review-wrap">
        <nav className="review-nav" aria-label="Sections">
          <a className="review-back" href="/">
            Back to the list
          </a>
          <a className="review-back" href="/collect">
            Collect
          </a>
        </nav>
        <p className="kicker">Review</p>
        <h1 className="plain-title">Candidates</h1>
        <p className="review-count">{rows.length} pending</p>
        <p className="review-progress">
          {stats.done} / {stats.total} companies · {stats.candidates} candidates
        </p>
        {providerEnabled ? (
          <div className="review-actions">
            <button className="primary" type="button" onClick={() => void collectAll()} disabled={locked}>
              Collect all
            </button>
          </div>
        ) : (
          <p className="review-note">Collected via local script</p>
        )}
        <div className="review-actions">
          <button className="ghost" type="button" disabled={locked || selected.size === 0} onClick={() => void review('approve', { ids: [...selected] })}>
            Approve selected
          </button>
          <button className="ghost" type="button" disabled={locked || selected.size === 0} onClick={() => void review('reject', { ids: [...selected] })}>
            Reject selected
          </button>
        </div>
        <p className="review-status" role="status">
          {message}
        </p>
        {groups.length === 0 ? <p className="lede">No pending profiles.</p> : null}
        {groups.map((group) => (
          <section key={group.company} aria-label={group.company}>
            <div className="review-company-row">
              <h2 className="review-company">{group.company}</h2>
              <div className="review-actions">
                {providerEnabled ? (
                  <button className="ghost" type="button" disabled={locked} onClick={() => void recollect(group.company)}>
                    Re-collect
                  </button>
                ) : null}
                <button className="ghost" type="button" disabled={locked} onClick={() => void review('approve', { company: group.company })}>
                  Approve all
                </button>
                <button className="ghost" type="button" disabled={locked} onClick={() => void review('reject', { company: group.company })}>
                  Reject all
                </button>
              </div>
            </div>
            <div className="review-list">
              {group.rows.map((row) => (
                <article className="card review-card" key={row.id}>
                  <label className="review-check">
                    <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} disabled={locked} />
                    <span>
                      <strong className="name">{row.fullName || 'Unknown name'}</strong>
                      {row.headline ? <span className="role">{row.headline}</span> : null}
                      {row.snippet ? <span className="review-snippet">{row.snippet}</span> : null}
                    </span>
                  </label>
                  <a className="review-open" href={row.linkedinUrl} target="_blank" rel="noopener noreferrer">
                    Open profile
                  </a>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}
