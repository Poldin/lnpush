'use client'

import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react'
import { useRouter } from 'next/navigation'

import {
  companyFilterLabel,
  companyFilterParams,
  companyIsSelected,
  readCompanyFilter,
  selectAllState,
  toggleCompanyInFilter,
  toggleVisibleInFilter,
  withHotCompanyFirst,
  type CompanyFilter,
} from '../lib/companies'
import { todayIso } from '../lib/dates'
import { DAILY_GOAL, dailyGoal, dailyGoalLine } from '../lib/goal'
import { openingChart, smoothCurve, type ChartRange } from '../lib/openingChart'
import { sortListCards } from '../lib/listOrder'
import { createBrowserSupabase } from '../lib/supabase/browser'
import { gestureCountsAsTap, nextTabFromSwipe } from '../lib/swipe'
import { tabQuery, type AppTab } from '../lib/tabs'
import { applyOpening, toOpening } from '../lib/usage'
import type { BoardPeriod } from '../lib/leaderboard'
import type { CardView, ContactLabel, HomeView, UsageCounts, UsageView } from '../lib/types'

export function TodayApp({
  memberId,
  memberName,
  timezone,
  isoDate,
  initialTab,
  initialCompanies,
  isAdmin,
}: {
  memberId: string
  memberName: string
  timezone: string
  isoDate: string
  initialTab: AppTab
  initialCompanies: string[]
  isAdmin: boolean
}) {
  const router = useRouter()
  const initialFilter = readCompanyFilter(initialCompanies)
  const [tab, setTab] = useState<AppTab>(initialTab)
  const [companyFilter, setCompanyFilter] = useState<CompanyFilter>(initialFilter)
  const [companyQuery, setCompanyQuery] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const ignoreClick = useRef(false)
  const [shownCount, setShownCount] = useState(20)
  const [usageShown, setUsageShown] = useState(10)
  const [elenco, setElenco] = useState<HomeView | null>(null)
  const [elencoError, setElencoError] = useState(false)
  const [usage, setUsage] = useState<UsageView | null>(null)
  const [usageError, setUsageError] = useState(false)
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [mine, setMine] = useState<{ recent: UsageView['recent']; counts: UsageCounts } | null>(null)
  const [armedId, setArmedId] = useState<string | null>(null)
  const armTimer = useRef<number | null>(null)
  const labelsRef = useRef<HomeView['contactLabels']>({})
  labelsRef.current = elenco?.contactLabels ?? {}
  const [passkey, setPasskey] = useState<'hidden' | 'offer' | 'ready' | 'done'>('hidden')
  const [passkeyMessage, setPasskeyMessage] = useState('')

  useEffect(() => {
    const checkDay = () => {
      if (todayIso(timezone) !== isoDate) window.location.reload()
    }
    const id = window.setInterval(checkDay, 60000)
    document.addEventListener('visibilitychange', checkDay)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', checkDay)
    }
  }, [isoDate, timezone])

  useEffect(() => {
    if (window.sessionStorage.getItem('lnpush-passkey-later') === '1') return
    let cancel = false
    const supabase = createBrowserSupabase()
    void supabase.auth.passkey.list().then(({ data, error }) => {
      if (cancel) return
      if (error) {
        setPasskey('offer')
        return
      }
      setPasskey(data && data.length > 0 ? 'ready' : 'offer')
    })
    return () => {
      cancel = true
    }
  }, [])

  async function registerPasskey() {
    setPasskeyMessage('')
    const supabase = createBrowserSupabase()
    const { error } = await supabase.auth.registerPasskey()
    if (!error) {
      setPasskey('done')
      return
    }
    const code = 'code' in error ? String(error.code) : ''
    setPasskeyMessage(
      code === 'passkey_disabled'
        ? 'Passkeys are not enabled on the Supabase project yet.'
        : 'Saving was cancelled or failed.',
    )
  }

  function writeUrl(nextTab: AppTab, filter: CompanyFilter) {
    const params = new URLSearchParams()
    params.set('tab', tabQuery(nextTab))
    for (const company of companyFilterParams(filter)) params.append('companies', company)
    router.replace(`/?${params.toString()}`, { scroll: false })
  }

  function selectTab(next: AppTab) {
    if (next === tab) return
    setTab(next)
    writeUrl(next, companyFilter)
  }

  function commitFilter(next: CompanyFilter) {
    setCompanyFilter(next)
    setShownCount(20)
    writeUrl(tab, next)
  }

  function onTouchStart(event: TouchEvent) {
    ignoreClick.current = false
    if (filterOpen || event.touches.length !== 1) {
      swipeStart.current = null
      return
    }
    const touch = event.touches[0]
    swipeStart.current = { x: touch.clientX, y: touch.clientY }
  }

  function onTouchEnd(event: TouchEvent) {
    const start = swipeStart.current
    swipeStart.current = null
    const touch = event.changedTouches[0]
    if (!start || !touch || filterOpen) return
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (!gestureCountsAsTap(dx, dy)) {
      ignoreClick.current = true
      window.setTimeout(() => {
        ignoreClick.current = false
      }, 500)
    }
    const next = nextTabFromSwipe(tab, dx, dy, filterOpen)
    if (next) selectTab(next)
  }

  function consumeTap() {
    if (!ignoreClick.current) return true
    ignoreClick.current = false
    return false
  }

  function openInNewTab(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  function activateListCard(card: CardView) {
    if (armedId !== card.id) {
      arm(card.id)
      return
    }
    openInNewTab(card.linkedinUrl)
    confirmOpen(card)
  }

  function openFromSlack(card: CardView) {
    if (!consumeTap()) return
    openInNewTab(card.linkedinUrl)
    confirmOpen(card)
  }

  useEffect(() => {
    let cancel = false
    void fetch('/api/elenco')
      .then(async (response) => {
        if (cancel) return
        if (!response.ok) {
          setElencoError(true)
          return
        }
        const data = (await response.json()) as HomeView
        setElenco(data)
        setHiddenIds(new Set(data.openedContactIds))
      })
      .catch(() => {
        if (!cancel) setElencoError(true)
      })
    void fetch('/api/utilizzo')
      .then(async (response) => {
        if (cancel) return
        if (!response.ok) {
          setUsageError(true)
          return
        }
        const data = (await response.json()) as UsageView
        setUsage(data)
        setMine({ recent: data.recent, counts: data.counts })
      })
      .catch(() => {
        if (!cancel) setUsageError(true)
      })
    return () => {
      cancel = true
    }
  }, [])

  function later() {
    window.sessionStorage.setItem('lnpush-passkey-later', '1')
    setPasskey('hidden')
  }

  useEffect(() => {
    return () => {
      if (armTimer.current) window.clearTimeout(armTimer.current)
    }
  }, [])

  function arm(id: string) {
    if (armTimer.current) window.clearTimeout(armTimer.current)
    setArmedId(id)
    armTimer.current = window.setTimeout(() => {
      setArmedId(null)
      armTimer.current = null
    }, 5000)
  }

  function hideContact(contactId: string) {
    setHiddenIds((current) => {
      if (current.has(contactId)) return current
      const next = new Set(current)
      next.add(contactId)
      return next
    })
  }

  function rememberOwnOpening(contactId: string, clickedAt: string, label?: ContactLabel) {
    const known = labelsRef.current[contactId]
    const opening = toOpening(
      {
        contactId,
        contactName: label?.name ?? known?.name ?? 'Profile',
        role: label?.role ?? known?.role ?? '',
        company: label?.company ?? known?.company ?? '',
        linkedinUrl: label?.linkedinUrl || known?.linkedinUrl || '',
        clickedAt,
      },
      timezone,
    )
    setMine((current) => applyOpening(current ?? { recent: [], counts: { today: 0, week: 0, month: 0, total: 0 } }, opening, timezone))
  }

  function refreshTeamBoards() {
  void fetch('/api/utilizzo')
    .then(async (response) => {
      if (!response.ok) return
      const data = (await response.json()) as UsageView
      setUsage((current) => (current ? { ...current, team: data.team } : current))
    })
    .catch(() => undefined)
}

function confirmOpen(card: CardView) {
    if (armTimer.current) window.clearTimeout(armTimer.current)
    armTimer.current = null
    setArmedId(null)
    hideContact(card.id)
    rememberOwnOpening(card.id, new Date().toISOString(), {
      name: card.name,
      role: card.role,
      company: card.company,
      linkedinUrl: card.linkedinUrl,
    })
    const body = new Blob([JSON.stringify({ contactId: card.id })], { type: 'application/json' })
    const sent = navigator.sendBeacon?.('/api/clicks', body) ?? false
    if (!sent) {
      void fetch('/api/clicks', {
        method: 'POST',
        body: JSON.stringify({ contactId: card.id }),
        headers: { 'content-type': 'application/json' },
        keepalive: true,
      })
    }
  }

  useEffect(() => {
    const supabase = createBrowserSupabase()
    const channel = supabase
      .channel('public-clicks')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'clicks' }, (payload) => {
        const row = payload.new as { contact_id?: string; team_member_id?: string; clicked_at?: string }
        if (!row.contact_id) return
        void refreshTeamBoards()
        const clickedAt = row.clicked_at ?? new Date().toISOString()
        if (row.team_member_id === memberId) {
          hideContact(row.contact_id)
          rememberOwnOpening(row.contact_id, clickedAt)
          return
        }
        setElenco((current) => {
          if (!current) return current
          return {
            ...current,
            cards: current.cards.map((card) =>
              card.id === row.contact_id ? { ...card, clickTimes: [...(card.clickTimes ?? []), clickedAt] } : card,
            ),
          }
        })
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [memberId, timezone])

  const visibleCards = sortListCards(
    (elenco?.cards ?? []).filter((card) => !hiddenIds.has(card.id)),
    {
      memberId,
      date: elenco?.isoDate ?? isoDate,
      now: new Date(),
      hotCompany: elenco?.hotCompany ?? null,
    },
  )
  const allCompanies = elenco?.companies ?? []
  const filteredCards =
    companyFilter.mode === 'all'
      ? visibleCards
      : companyFilter.mode === 'none'
        ? []
        : visibleCards.filter((card) => companyFilter.picked.includes(card.company))
  const shownCards = filteredCards.slice(0, shownCount)
  const companyChoices = withHotCompanyFirst(
    allCompanies.filter((company) => company.toLocaleLowerCase('it').includes(companyQuery.trim().toLocaleLowerCase('it'))),
    elenco?.hotCompany,
  )

  return (
    <main className="wrap" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onTouchCancel={() => (swipeStart.current = null)}>
      <a className="skip" href="#lista">
        Skip to the list
      </a>
      <div className="toolbar">
        <p className="hello">
          Hi <strong>{memberName}</strong>
        </p>
        <div className="toolbar-actions">
          <a className="icon-link" href="/collect" aria-label="Collect profiles">
            <CollectIcon />
          </a>
          {isAdmin ? (
            <a className="icon-link" href="/review" aria-label="Review candidates">
              <ReviewIcon />
            </a>
          ) : null}
          <form action="/api/logout" method="post">
            <button className="linkish" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </div>
      <DailyGoal openedToday={mine?.counts.today ?? null} unavailable={usageError || usage?.unavailable === true} />
      <div className="tabs" role="tablist" aria-label="Sections">
        <button className={tab === 'elenco' ? 'tab on' : 'tab'} type="button" role="tab" aria-selected={tab === 'elenco'} onClick={() => selectTab('elenco')}>
          List
        </button>
        <button className={tab === 'utilizzo' ? 'tab on' : 'tab'} type="button" role="tab" aria-selected={tab === 'utilizzo'} onClick={() => selectTab('utilizzo')}>
          Activity
        </button>
        <button
          className={tab === 'slack' ? 'tab icon on' : 'tab icon'}
          type="button"
          role="tab"
          aria-selected={tab === 'slack'}
          aria-label="Slack preview"
          onClick={() => selectTab('slack')}
        >
          <SlackLogo />
        </button>
      </div>

      {tab === 'slack' ? (
        <SlackPreview
          loading={!elenco && !elencoError}
          error={elencoError}
          cards={visibleCards}
          today={mine?.counts.today ?? 0}
          timeZone={timezone}
          onOpen={openFromSlack}
        />
      ) : null}

      {tab === 'utilizzo' ? (
        usageError || usage?.unavailable ? (
          <UsagePanel
            unavailable
            timeZone={timezone}
            counts={{ today: 0, week: 0, month: 0, total: 0 }}
            team={null}
            recent={[]}
            shown={0}
            onMore={() => undefined}
            onOpen={() => undefined}
            onKeyOpen={() => undefined}
          />
        ) : mine ? (
          <UsagePanel
            unavailable={false}
            timeZone={timezone}
            counts={mine.counts}
            team={usage?.team ?? null}
            recent={mine.recent}
            shown={usageShown}
            onMore={() => setUsageShown((current) => current + 10)}
            onOpen={(url) => {
              if (consumeTap()) openInNewTab(url)
            }}
            onKeyOpen={openInNewTab}
          />
        ) : (
          <UsageSkeleton />
        )
      ) : null}

      {tab === 'elenco' && passkey === 'offer' ? (
        <section className="card passkey">
          <h2 className="name">This phone</h2>
          <p className="role">Save your fingerprint, face, or PIN. Next time you will not need email.</p>
          <button className="primary" type="button" onClick={registerPasskey}>
            Save this device
          </button>
          <button className="linkish" type="button" onClick={later}>
            Not now
          </button>
          {passkeyMessage ? <p className="status">{passkeyMessage}</p> : null}
        </section>
      ) : null}
      {tab === 'elenco' && passkey === 'done' ? <p className="status">Device saved.</p> : null}

      {tab === 'elenco' && elencoError ? (
        <section className="card" id="lista">
          <h2 className="name">List</h2>
          <p className="role">The list cannot be loaded right now.</p>
        </section>
      ) : null}

      {tab === 'elenco' && !elenco && !elencoError ? <ElencoSkeleton /> : null}

      {tab === 'elenco' && elenco && visibleCards.length === 0 ? (
        <section className="card" id="lista">
          <h2 className="name">The list is empty</h2>
          <p className="role">You have already opened every profile here.</p>
        </section>
      ) : null}

      {tab === 'elenco' && elenco ? (
        <CompanyFilter
          open={filterOpen}
          query={companyQuery}
          filter={companyFilter}
          allCompanies={allCompanies}
          hotCompany={elenco.hotCompany ?? null}
          choices={companyChoices}
          onToggleOpen={() => setFilterOpen((current) => !current)}
          onClose={() => setFilterOpen(false)}
          onQuery={setCompanyQuery}
          onToggle={(company) => commitFilter(toggleCompanyInFilter(companyFilter, company, allCompanies))}
          onToggleVisible={() => commitFilter(toggleVisibleInFilter(companyFilter, companyChoices, allCompanies))}
        />
      ) : null}

      {tab === 'elenco' && elenco && !elenco.beforeStart && filteredCards.length === 0 && visibleCards.length > 0 ? (
        <section className="card">
          <h2 className="name">No profiles</h2>
          <p className="role">No profiles for the selected companies.</p>
        </section>
      ) : null}

      {tab === 'elenco' && elenco && !elenco.beforeStart && shownCards.length > 0 ? (
        <section id="lista" aria-label="List">
          <div className="cards">
            {shownCards.map((card) => {
              const armed = armedId === card.id
              const company = card.company ? `, ${card.company}` : ''
              return (
                <ProfileCard
                  key={card.id}
                  hot={Boolean(elenco?.hotCompany) && card.company === elenco.hotCompany}
                  armed={armed}
                  label={armed ? 'Tap again to open' : 'View on'}
                  ariaLabel={
                    armed
                      ? `Tap again to open the LinkedIn profile of ${card.name}${company}`
                      : `View the LinkedIn profile of ${card.name}${company}`
                  }
                  onActivate={() => {
                    if (consumeTap()) activateListCard(card)
                  }}
                  onKeyActivate={() => activateListCard(card)}
                >
                  <ProfileFacts name={card.name} role={card.role} company={card.company} refresh={card.refresh} />
                </ProfileCard>
              )
            })}
          </div>
          {shownCards.length < filteredCards.length ? (
            <button className="ghost wide more" type="button" onClick={() => setShownCount((current) => current + 20)}>
              Load more
            </button>
          ) : null}
        </section>
      ) : null}
    </main>
  )
}

function CompanyFilter({
  open,
  query,
  filter,
  allCompanies,
  hotCompany,
  choices,
  onToggleOpen,
  onClose,
  onQuery,
  onToggle,
  onToggleVisible,
}: {
  open: boolean
  query: string
  filter: CompanyFilter
  allCompanies: string[]
  hotCompany: string | null
  choices: string[]
  onToggleOpen: () => void
  onClose: () => void
  onQuery: (value: string) => void
  onToggle: (company: string) => void
  onToggleVisible: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const allBox = useRef<HTMLInputElement>(null)
  const ignoreClose = useRef(false)
  const visibleState = selectAllState(filter, choices, allCompanies)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
    return () => {
      if (!dialog.open) return
      ignoreClose.current = true
      dialog.close()
    }
  }, [open])

  useEffect(() => {
    if (allBox.current) allBox.current.indeterminate = visibleState === 'pick'
  }, [visibleState, open])

  return (
    <div className="filter">
      <button
        className="filter-button"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="company-picker"
        onClick={onToggleOpen}
      >
        <span>{companyFilterLabel(filter)}</span>
        <span aria-hidden="true">{open ? '–' : '+'}</span>
      </button>
      <dialog
        id="company-picker"
        className="company-dialog"
        ref={dialogRef}
        tabIndex={-1}
        aria-label="Companies"
        onClose={() => {
          if (ignoreClose.current) {
            ignoreClose.current = false
            return
          }
          onClose()
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose()
        }}
      >
        <input
          className="filter-search"
          type="search"
          value={query}
          placeholder="Search companies"
          aria-label="Search companies"
          onChange={(event) => onQuery(event.target.value)}
        />
        <label className="filter-option">
          <input
            ref={allBox}
            type="checkbox"
            checked={visibleState === 'all'}
            onChange={onToggleVisible}
          />
          <span>Select all</span>
        </label>
        <div className="filter-list">
          {choices.length === 0 ? <p className="role">No companies found.</p> : null}
          {choices.map((company) => (
            <label className="filter-option" key={company}>
              <input
                type="checkbox"
                checked={companyIsSelected(filter, company, allCompanies)}
                onChange={() => onToggle(company)}
              />
              <span>
                {company === hotCompany ? <span aria-hidden="true">🔥 </span> : null}
                {company}
              </span>
            </label>
          ))}
        </div>
      </dialog>
    </div>
  )
}

function ProfileCard({
  armed,
  hot,
  label,
  ariaLabel,
  onActivate,
  onKeyActivate,
  children,
}: {
  armed?: boolean
  hot?: boolean
  label: string
  ariaLabel: string
  onActivate: () => void
  onKeyActivate: () => void
  children: ReactNode
}) {
  return (
    <article
      className={hot ? 'card profile-card hot' : 'card profile-card'}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={onActivate}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onKeyActivate()
      }}
    >
      {hot ? <p className="hot-note">🔥 Hot company of the week</p> : null}
      {children}
      <div className="card-action">
        <span className={armed ? 'see-link arming' : 'see-link'}>
          <SeeLinkFace label={label} />
        </span>
      </div>
    </article>
  )
}

function DailyGoal({ openedToday, unavailable }: { openedToday: number | null; unavailable: boolean }) {
  const seen = useRef<number | null>(null)
  const [celebrate, setCelebrate] = useState(false)

  useEffect(() => {
    if (openedToday === null) return
    const previous = seen.current
    seen.current = openedToday
    if (previous !== null && previous < DAILY_GOAL && openedToday >= DAILY_GOAL) {
      setCelebrate(true)
      const timer = window.setTimeout(() => setCelebrate(false), 1400)
      return () => window.clearTimeout(timer)
    }
  }, [openedToday])

  if (openedToday === null && !unavailable) return <GoalSkeleton />

  const view = dailyGoal(openedToday ?? 0)
  const label = unavailable
    ? "Today's count isn't available"
    : view.complete
      ? `${view.number} profiles opened today. Daily goal of ${DAILY_GOAL} reached.`
      : `${view.number} profiles left to reach today's goal of ${DAILY_GOAL}.`
  return (
    <section className={celebrate ? 'goal celebrate' : 'goal'} aria-label={label}>
      <span className="goal-emoji" aria-hidden="true">
        {unavailable ? '🐐' : view.emoji}
      </span>
      <span className="goal-number">{unavailable ? '–' : view.number}</span>
      <p className="goal-phrase">{unavailable ? "Today's count isn't available" : view.phrase}</p>
      <div className="goal-track" aria-hidden="true">
        <span style={{ width: `${unavailable ? 0 : view.progress * 100}%` }} />
      </div>
    </section>
  )
}

function GoalSkeleton() {
  return (
    <div className="goal" aria-hidden="true">
      <span className="skeleton goal-skeleton-mark" />
      <span className="skeleton goal-skeleton-mark" />
      <span className="skeleton goal-skeleton-phrase" />
      <div className="goal-track">
        <span className="skeleton" />
      </div>
    </div>
  )
}

function SeeLinkFace({ label }: { label: string }) {
  return (
    <span className="see-link-hit">
      <span>{label}</span>
      <LinkedInMark />
      <span aria-hidden="true">↗</span>
    </span>
  )
}

function CollectIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M10.5 3a7.5 7.5 0 0 1 5.96 12.05l4.24 4.25-1.41 1.41-4.24-4.24A7.5 7.5 0 1 1 10.5 3zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z"
      />
    </svg>
  )
}

function ReviewIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M7 3h10a2 2 0 0 1 2 2v16l-7-3.2L5 21V5a2 2 0 0 1 2-2zm1.2 6.2 2.1 2.1 4.6-4.6 1.2 1.2-5.8 5.8-3.3-3.3 1.2-1.2z"
      />
    </svg>
  )
}

function SlackLogo() {
  return (
    <svg className="slack-logo" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path fill="#E01E5A" d="M6 15a2 2 0 1 1-2-2h2v2zm1 0a2 2 0 0 1 2-2 2 2 0 0 1 2 2v5a2 2 0 1 1-4 0v-5z" />
      <path fill="#36C5F0" d="M9 6a2 2 0 1 1 2-2v2H9zm0 1a2 2 0 0 1 2 2 2 2 0 0 1-2 2H4a2 2 0 1 1 0-4h5z" />
      <path fill="#2EB67D" d="M18 9a2 2 0 1 1 2 2h-2V9zm-1 0a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 1 1 4 0v5z" />
      <path fill="#ECB22E" d="M15 18a2 2 0 1 1-2 2v-2h2zm0-1a2 2 0 0 1-2-2 2 2 0 0 1 2-2h5a2 2 0 1 1 0 4h-5z" />
    </svg>
  )
}

function SlackPreview({
  loading,
  error,
  cards,
  today,
  timeZone,
  onOpen,
}: {
  loading: boolean
  error: boolean
  cards: CardView[]
  today: number
  timeZone: string
  onOpen: (card: CardView) => void
}) {
  const time = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date())
  return (
    <section className="slack-home" aria-label="Slack preview">
      <div className="slack-message">
        <span className="slack-avatar" aria-hidden="true">
          ln
        </span>
        <div className="slack-body">
          <p className="slack-meta">
            <strong className="slack-app-name">lnpush</strong>
            <span className="slack-app">APP</span>
            <time>{time}</time>
          </p>
          <p className="slack-header">Your LinkedIn cards for today</p>
          <p className="slack-context">{dailyGoalLine(today)}</p>
          {error ? <p className="slack-context">The list cannot be loaded right now.</p> : null}
          {loading ? <p className="slack-context">Loading cards…</p> : null}
          {!loading && !error && cards.length === 0 ? <p className="slack-context">No cards for today.</p> : null}
          {cards.map((card, index) => {
            const hot = Boolean(card.hot)
            const details = [card.role, card.company].filter(Boolean).join(' · ')
            return (
              <article key={card.id}>
                {index > 0 ? <hr className="slack-divider" /> : null}
                <div className="slack-section">
                  <div className="slack-copy">
                    <p className="slack-name">
                      {hot ? <span aria-hidden="true">🔥 </span> : null}
                      {card.refresh ? <span aria-hidden="true">🔁 </span> : null}
                      <strong>{card.name}</strong>
                    </p>
                    {details ? <p className="slack-fields">{details}</p> : null}
                    {hot ? <p className="slack-context">Hot company of the week</p> : null}
                    {card.cooled ? <p className="slack-context slack-rest">Resting · two opens in the last 48 hours</p> : null}
                  </div>
                  <button className="slack-button" type="button" onClick={() => onOpen(card)}>
                    Open profile
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function CounterRow({
  who,
  values,
  selected,
  onSelect,
}: {
  who: string
  values: readonly (readonly [ChartRange, string, number])[]
  selected: ChartRange | null
  onSelect: (range: ChartRange) => void
}) {
  return (
    <div className="counter-row">
      <span className="who-label">{who}</span>
      {values.map(([value, label, count]) => (
        <button
          key={value}
          className={selected === value ? 'stat on' : 'stat'}
          type="button"
          role="tab"
          aria-selected={selected === value}
          onClick={() => onSelect(value)}
        >
          <span className="stat-label">{label}</span>
          <span className="stat-value">{count}</span>
        </button>
      ))}
    </div>
  )
}

function OpeningChart({ counts }: { counts: number[] }) {
  const curve = smoothCurve(counts)
  return (
    <div className="opening-chart" aria-hidden="true">
      <svg viewBox="0 0 320 72">
        {curve ? <path d={curve.line} fill="none" stroke="#3a3a40" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /> : null}
      </svg>
    </div>
  )
}

function Leaderboards({ team }: { team: NonNullable<UsageView['team']> }) {
  const [peoplePeriod, setPeoplePeriod] = useState<BoardPeriod>('week')
  const [companyPeriod, setCompanyPeriod] = useState<BoardPeriod>('week')
  return (
    <details className="boards">
      <summary>Leaderboards</summary>
      <Board
        title="Most clicked people"
        period={peoplePeriod}
        onPeriod={setPeoplePeriod}
        empty="No clicks in this period."
        rows={team.people[peoplePeriod].map((row) => ({
          key: row.contactId,
          label: row.company ? `${row.name} · ${row.company}` : row.name,
          clicks: row.clicks,
        }))}
      />
      <Board
        title="Most clicked companies"
        period={companyPeriod}
        onPeriod={setCompanyPeriod}
        empty="No companies in this period."
        rows={team.companies[companyPeriod].map((row) => ({
          key: row.company,
          label: row.company,
          clicks: row.clicks,
        }))}
      />
    </details>
  )
}

function Board({
  title,
  period,
  onPeriod,
  rows,
  empty,
}: {
  title: string
  period: BoardPeriod
  onPeriod: (period: BoardPeriod) => void
  rows: { key: string; label: string; clicks: number }[]
  empty: string
}) {
  return (
    <section className="board" aria-label={title}>
      <h2 className="board-title">{title}</h2>
      <div className="board-switch" role="group" aria-label={`${title} period`}>
        {(
          [
            ['week', '7 days'],
            ['month', '30 days'],
            ['all', 'All time'],
          ] as const
        ).map(([value, label]) => (
          <button key={value} className={period === value ? 'board-option on' : 'board-option'} type="button" aria-pressed={period === value} onClick={() => onPeriod(value)}>
            {label}
          </button>
        ))}
      </div>
      {rows.length === 0 ? <p className="board-empty">{empty}</p> : null}
      <ol className="board-list">
        {rows.map((row, index) => (
          <li key={row.key}>
            <span className="board-rank">{index + 1}</span>
            <span className="board-label">{row.label}</span>
            <span className="board-count">{row.clicks}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function UsagePanel({
  unavailable,
  timeZone,
  counts,
  team,
  recent,
  shown,
  onMore,
  onOpen,
  onKeyOpen,
}: {
  unavailable: boolean
  timeZone: string
  counts: UsageCounts
  team: UsageView['team']
  recent: UsageView['recent']
  shown: number
  onMore: () => void
  onOpen: (url: string) => void
  onKeyOpen: (url: string) => void
}) {
  const [series, setSeries] = useState<'you' | 'team'>('you')
  const [range, setRange] = useState<ChartRange>('week')
  if (unavailable) {
    return (
      <section className="card" id="lista">
        <h2 className="name">Activity</h2>
        <p className="role">Openings cannot be loaded right now.</p>
      </section>
    )
  }
  return (
    <section id="lista" aria-labelledby="utilizzo-title">
      <div className="counter-matrix" role="tablist" aria-label="Openings over time">
        <CounterRow
          who="You"
          selected={series === 'you' ? range : null}
          values={[
            ['week', '7 days', counts.week],
            ['month', '30 days', counts.month],
            ['all', 'Total', counts.total],
          ]}
          onSelect={(next) => {
            setSeries('you')
            setRange(next)
          }}
        />
        <CounterRow
          who="Team"
          selected={series === 'team' ? range : null}
          values={[
            ['week', '7 days', team?.week ?? 0],
            ['month', '30 days', team?.month ?? 0],
            ['all', 'Total', team?.total ?? 0],
          ]}
          onSelect={(next) => {
            setSeries('team')
            setRange(next)
          }}
        />
      </div>
      <OpeningChart
        counts={openingChart(series === 'team' ? (team?.times ?? []) : recent.map((item) => item.clickedAt), range, timeZone).map((bar) => bar.count)}
      />
      {team ? <Leaderboards team={team} /> : null}
      <h1 className="list-title" id="utilizzo-title">
        Your openings
      </h1>
      {recent.length === 0 ? <p className="role">No openings yet.</p> : null}
      <div className="cards">
        {recent.slice(0, shown).map((item) => {
          const company = item.company ? `, ${item.company}` : ''
          const facts = <ProfileFacts name={item.contactName} role={item.role} company={item.company} when={item.whenLabel} />
          if (!item.linkedinUrl) {
            return (
              <article className="card profile-card" key={`${item.contactId}-${item.clickedAt}`}>
                {facts}
              </article>
            )
          }
          return (
            <ProfileCard
              key={`${item.contactId}-${item.clickedAt}`}
              label="View on"
              ariaLabel={`View the LinkedIn profile of ${item.contactName}${company}`}
              onActivate={() => onOpen(item.linkedinUrl)}
              onKeyActivate={() => onKeyOpen(item.linkedinUrl)}
            >
              {facts}
            </ProfileCard>
          )
        })}
      </div>
      {shown < recent.length ? (
        <button className="ghost wide more" type="button" onClick={onMore}>
          Load more
        </button>
      ) : null}
    </section>
  )
}

function ProfileFacts({ name, role, company, when, refresh }: { name: string; role: string; company: string; when?: string; refresh?: boolean }) {
  return (
    <>
      {company ? (
        <p className="company">
          <BuildingIcon />
          <span>{company}</span>
        </p>
      ) : null}
      <h3 className="name">
        {refresh ? (
          <span className="refresh-mark" aria-hidden="true">
            🔁{' '}
          </span>
        ) : null}
        {name}
      </h3>
      {role ? <p className="role">{role}</p> : null}
      {when ? <p className="when">{when}</p> : null}
    </>
  )
}

function BuildingIcon() {
  return (
    <svg className="building" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M4 2h16v20H4V2zm3 3h3.2v3.2H7V5zm6.8 0H17v3.2h-3.2V5zM7 10.4h3.2v3.2H7v-3.2zm6.8 0H17v3.2h-3.2v-3.2zM10 16h4v6h-4v-6z"
      />
    </svg>
  )
}

function LinkedInMark() {
  return (
    <svg className="li-mark" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.23 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.46c.98 0 1.77-.77 1.77-1.73V1.73C24 .77 23.21 0 22.23 0z"
      />
    </svg>
  )
}

function ElencoSkeleton() {
  return (
    <div className="cards" aria-hidden="true">
      {['a', 'b', 'c'].map((key) => (
        <article className="card skeleton-card" key={key}>
          <div className="skeleton skeleton-line short" />
          <div className="skeleton skeleton-line name-line" />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-button" />
        </article>
      ))}
    </div>
  )
}

function UsageSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="counter-matrix">
        <div className="counter-row">
          <span className="skeleton who-skeleton" />
          <span className="skeleton skeleton-count" />
          <span className="skeleton skeleton-count" />
          <span className="skeleton skeleton-count" />
        </div>
        <div className="counter-row">
          <span className="skeleton who-skeleton" />
          <span className="skeleton skeleton-count" />
          <span className="skeleton skeleton-count" />
          <span className="skeleton skeleton-count" />
        </div>
      </div>
      <div className="skeleton skeleton-line title-line" />
      <div className="cards">
        {['a', 'b', 'c'].map((key) => (
          <article className="card skeleton-card" key={key}>
            <div className="skeleton skeleton-line short" />
            <div className="skeleton skeleton-line name-line" />
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-button" />
          </article>
        ))}
      </div>
    </div>
  )
}
