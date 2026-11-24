'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { todayIso } from '../lib/dates'
import { createBrowserSupabase } from '../lib/supabase/browser'
import type { AppTab } from '../lib/tabs'
import { applyOpening, toOpening } from '../lib/usage'
import type { CardView, ContactLabel, HomeView, UsageCounts, UsageView } from '../lib/types'

// Same-tab on phones so the OS can hand https://www.linkedin.com/in/... to the LinkedIn app.
export function TodayApp({
  memberId,
  memberName,
  timezone,
  isoDate,
  initialTab,
  initialCompanies,
}: {
  memberId: string
  memberName: string
  timezone: string
  isoDate: string
  initialTab: AppTab
  initialCompanies: string[]
}) {
  const router = useRouter()
  const [tab, setTab] = useState<AppTab>(initialTab)
  const [companies, setCompanies] = useState<string[]>(initialCompanies)
  const [companyQuery, setCompanyQuery] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
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
        ? 'I passkey non sono ancora attivi sul progetto Supabase.'
        : 'Registrazione annullata o non riuscita.',
    )
  }

  function writeUrl(nextTab: AppTab, nextCompanies: string[]) {
    const params = new URLSearchParams()
    params.set('tab', nextTab)
    for (const company of nextCompanies) params.append('aziende', company)
    router.replace(`/?${params.toString()}`, { scroll: false })
  }

  function selectTab(next: AppTab) {
    if (next === tab) return
    setTab(next)
    writeUrl(next, companies)
  }

  function toggleCompany(company: string) {
    const next = companies.includes(company) ? companies.filter((item) => item !== company) : [...companies, company]
    setCompanies(next)
    setShownCount(20)
    writeUrl(tab, next)
  }

  function clearCompanies() {
    setCompanies([])
    setShownCount(20)
    writeUrl(tab, [])
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
    const opening = toOpening(
      {
        contactId,
        contactName: label?.name ?? labelsRef.current[contactId]?.name ?? 'Profilo',
        role: label?.role ?? labelsRef.current[contactId]?.role ?? '',
        company: label?.company ?? labelsRef.current[contactId]?.company ?? '',
        clickedAt,
      },
      timezone,
    )
    setMine((current) => applyOpening(current ?? { recent: [], counts: { today: 0, week: 0, total: 0 } }, opening, timezone))
  }

  function confirmOpen(card: CardView) {
    if (armTimer.current) window.clearTimeout(armTimer.current)
    armTimer.current = null
    setArmedId(null)
    hideContact(card.id)
    rememberOwnOpening(card.id, new Date().toISOString(), { name: card.name, role: card.role, company: card.company })
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
        hideContact(row.contact_id)
        if (row.team_member_id === memberId) {
          rememberOwnOpening(row.contact_id, row.clicked_at ?? new Date().toISOString())
        }
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [memberId, timezone])

  const visibleCards = (elenco?.cards ?? []).filter((card) => !hiddenIds.has(card.id))
  const filteredCards =
    companies.length === 0 ? visibleCards : visibleCards.filter((card) => companies.includes(card.company))
  const shownCards = filteredCards.slice(0, shownCount)
  const companyChoices = (elenco?.companies ?? []).filter((company) =>
    company.toLocaleLowerCase('it').includes(companyQuery.trim().toLocaleLowerCase('it')),
  )

  return (
    <main className="wrap">
      <a className="skip" href="#lista">
        Vai alla lista
      </a>
      <div className="toolbar">
        <p className="hello">
          Ciao <strong>{memberName}</strong>
        </p>
        <form action="/api/logout" method="post">
          <button className="linkish" type="submit">
            Esci
          </button>
        </form>
      </div>
      <div className="tabs" role="tablist" aria-label="Sezioni">
        <button className={tab === 'elenco' ? 'tab on' : 'tab'} type="button" role="tab" aria-selected={tab === 'elenco'} onClick={() => selectTab('elenco')}>
          Elenco
        </button>
        <button className={tab === 'utilizzo' ? 'tab on' : 'tab'} type="button" role="tab" aria-selected={tab === 'utilizzo'} onClick={() => selectTab('utilizzo')}>
          Utilizzo
        </button>
      </div>

      {tab === 'utilizzo' ? (
        usageError || usage?.unavailable ? (
          <UsagePanel unavailable counts={{ today: 0, week: 0, total: 0 }} recent={[]} shown={0} onMore={() => undefined} />
        ) : mine ? (
          <UsagePanel
            unavailable={false}
            counts={mine.counts}
            recent={mine.recent}
            shown={usageShown}
            onMore={() => setUsageShown((current) => current + 10)}
          />
        ) : (
          <UsageSkeleton />
        )
      ) : null}

      {tab === 'elenco' && passkey === 'offer' ? (
        <section className="card passkey">
          <h2 className="name">Questo telefono</h2>
          <p className="role">Registra l’impronta, il volto o il PIN. I prossimi accessi non chiedono l’email.</p>
          <button className="primary" type="button" onClick={registerPasskey}>
            Registra il dispositivo
          </button>
          <button className="linkish" type="button" onClick={later}>
            Più tardi
          </button>
          {passkeyMessage ? <p className="status">{passkeyMessage}</p> : null}
        </section>
      ) : null}
      {tab === 'elenco' && passkey === 'done' ? <p className="status">Dispositivo registrato.</p> : null}

      {tab === 'elenco' && elencoError ? (
        <section className="card" id="lista">
          <h2 className="name">Elenco</h2>
          <p className="role">L’elenco non è leggibile in questo momento.</p>
        </section>
      ) : null}

      {tab === 'elenco' && !elenco && !elencoError ? <ElencoSkeleton /> : null}

      {tab === 'elenco' && elenco?.beforeStart ? (
        <section className="card" id="lista">
          <h2 className="name">Il piano parte il {elenco.startLabel}</h2>
          <p className="role">Oggi non ci sono profili da aprire.</p>
        </section>
      ) : null}

      {tab === 'elenco' && elenco && !elenco.beforeStart && visibleCards.length === 0 ? (
        <section className="card" id="lista">
          <h2 className="name">Oggi la lista è vuota</h2>
          <p className="role">
            I profili già aperti o già usciti restano in pausa {elenco.cooldownDays} giorni e possono andare al massimo a{' '}
            {elenco.maxMembersPerContact} persone del team.
          </p>
        </section>
      ) : null}

      {tab === 'elenco' && elenco && !elenco.beforeStart ? (
        <CompanyFilter
          open={filterOpen}
          query={companyQuery}
          selected={companies}
          choices={companyChoices}
          onToggleOpen={() => setFilterOpen((current) => !current)}
          onQuery={setCompanyQuery}
          onToggle={toggleCompany}
          onClear={clearCompanies}
        />
      ) : null}

      {tab === 'elenco' && elenco && !elenco.beforeStart && filteredCards.length === 0 && visibleCards.length > 0 ? (
        <section className="card">
          <h2 className="name">Nessun profilo</h2>
          <p className="role">Nessun profilo per le aziende scelte.</p>
        </section>
      ) : null}

      {tab === 'elenco' && elenco && !elenco.beforeStart && shownCards.length > 0 ? (
        <section id="lista" aria-label="Elenco">
          <div className="cards">
            {shownCards.map((card) => (
              <article className="card" key={card.id}>
                <ProfileFacts name={card.name} role={card.role} company={card.company} />
                <div className="card-action">
                  <ProfileLink
                    card={card}
                    armed={armedId === card.id}
                    onArm={() => arm(card.id)}
                    onConfirm={() => confirmOpen(card)}
                  />
                </div>
              </article>
            ))}
          </div>
          {shownCards.length < filteredCards.length ? (
            <button className="ghost wide more" type="button" onClick={() => setShownCount((current) => current + 20)}>
              Carica altri
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
  selected,
  choices,
  onToggleOpen,
  onQuery,
  onToggle,
  onClear,
}: {
  open: boolean
  query: string
  selected: string[]
  choices: string[]
  onToggleOpen: () => void
  onQuery: (value: string) => void
  onToggle: (company: string) => void
  onClear: () => void
}) {
  const label = selected.length === 0 ? 'Tutte le aziende' : selected.length === 1 ? selected[0] : `${selected.length} aziende`
  return (
    <div className="filter">
      <button className="filter-button" type="button" aria-expanded={open} onClick={onToggleOpen}>
        <span>{label}</span>
        <span aria-hidden="true">{open ? '–' : '+'}</span>
      </button>
      {open ? (
        <div className="filter-panel">
          <input
            className="filter-search"
            type="search"
            value={query}
            placeholder="Cerca azienda"
            aria-label="Cerca azienda"
            onChange={(event) => onQuery(event.target.value)}
          />
          <button className="linkish" type="button" onClick={onClear} disabled={selected.length === 0}>
            Azzera
          </button>
          <div className="filter-list">
            {choices.length === 0 ? <p className="role">Nessuna azienda trovata.</p> : null}
            {choices.map((company) => (
              <label className="filter-option" key={company}>
                <input type="checkbox" checked={selected.includes(company)} onChange={() => onToggle(company)} />
                <span>{company}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ProfileLink({
  card,
  armed,
  onArm,
  onConfirm,
}: {
  card: CardView
  armed: boolean
  onArm: () => void
  onConfirm: () => void
}) {
  const company = card.company ? `, ${card.company}` : ''
  return (
    <a
      className={armed ? 'see-link arming' : 'see-link'}
      href={card.linkedinUrl}
      target="_blank"
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
      aria-label={
        armed
          ? `Tocca di nuovo per aprire il profilo LinkedIn di ${card.name}${company}`
          : `Vedi su LinkedIn il profilo di ${card.name}${company}`
      }
      onClick={(event) => {
        if (!armed) {
          event.preventDefault()
          onArm()
          return
        }
        onConfirm()
      }}
    >
      <span>{armed ? 'Tocca di nuovo' : 'Vedi su'}</span>
      <LinkedInMark />
      <span aria-hidden="true">↗</span>
    </a>
  )
}

function UsagePanel({
  unavailable,
  counts,
  recent,
  shown,
  onMore,
}: {
  unavailable: boolean
  counts: UsageCounts
  recent: UsageView['recent']
  shown: number
  onMore: () => void
}) {
  if (unavailable) {
    return (
      <section className="card" id="lista">
        <h2 className="name">Utilizzo</h2>
        <p className="role">Le aperture non sono leggibili in questo momento.</p>
      </section>
    )
  }
  return (
    <section id="lista" aria-labelledby="utilizzo-title">
      <h1 className="list-title" id="utilizzo-title">
        Le tue aperture
      </h1>
      <article className="card">
        <dl className="stats">
          <div>
            <dt>Oggi</dt>
            <dd>{counts.today}</dd>
          </div>
          <div>
            <dt>7 giorni</dt>
            <dd>{counts.week}</dd>
          </div>
          <div>
            <dt>Totale</dt>
            <dd>{counts.total}</dd>
          </div>
        </dl>
      </article>
      {recent.length === 0 ? <p className="role">Nessuna apertura ancora.</p> : null}
      <div className="cards">
        {recent.slice(0, shown).map((item) => (
          <article className="card" key={`${item.contactId}-${item.clickedAt}`}>
            <ProfileFacts name={item.contactName} role={item.role} company={item.company} when={item.whenLabel} />
          </article>
        ))}
      </div>
      {shown < recent.length ? (
        <button className="ghost wide more" type="button" onClick={onMore}>
          Carica altri
        </button>
      ) : null}
    </section>
  )
}

function ProfileFacts({ name, role, company, when }: { name: string; role: string; company: string; when?: string }) {
  return (
    <>
      {company ? (
        <p className="company">
          <BuildingIcon />
          <span>{company}</span>
        </p>
      ) : null}
      <h3 className="name">{name}</h3>
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
      <div className="skeleton skeleton-line title-line" />
      <article className="card skeleton-card">
        <div className="stats">
          <div className="skeleton skeleton-count" />
          <div className="skeleton skeleton-count" />
          <div className="skeleton skeleton-count" />
        </div>
      </article>
      <div className="cards">
        {['a', 'b', 'c'].map((key) => (
          <article className="card skeleton-card" key={key}>
            <div className="skeleton skeleton-line name-line" />
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line short" />
          </article>
        ))}
      </div>
    </div>
  )
}
