'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { todayIso } from '../lib/dates'
import { createBrowserSupabase } from '../lib/supabase/browser'
import { parseTab, type AppTab } from '../lib/tabs'
import { applyOpening, toOpening } from '../lib/usage'
import type { CardView, ContactLabel, HomeView, UsageCounts, UsageView } from '../lib/types'

// Same-tab on phones so the OS can hand https://www.linkedin.com/in/... to the LinkedIn app.
const DESKTOP_LINK = '(min-width: 900px) and (pointer: fine)'

export function TodayApp({ view, usage }: { view: HomeView; usage: UsageView }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab = parseTab(searchParams.get('tab'))
  const [newTab, setNewTab] = useState(false)
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set(view.openedContactIds))
  const [mine, setMine] = useState<{ recent: UsageView['recent']; counts: UsageCounts }>({
    recent: usage.recent,
    counts: usage.counts,
  })
  const [armedId, setArmedId] = useState<string | null>(null)
  const armTimer = useRef<number | null>(null)
  const [passkey, setPasskey] = useState<'hidden' | 'offer' | 'ready' | 'done'>('hidden')
  const [passkeyMessage, setPasskeyMessage] = useState('')

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_LINK)
    const applyTab = () => setNewTab(media.matches)
    applyTab()
    media.addEventListener('change', applyTab)
    return () => media.removeEventListener('change', applyTab)
  }, [])

  useEffect(() => {
    const checkDay = () => {
      if (todayIso(view.timezone) !== view.isoDate) window.location.reload()
    }
    const id = window.setInterval(checkDay, 60000)
    document.addEventListener('visibilitychange', checkDay)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', checkDay)
    }
  }, [view.isoDate, view.timezone])

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

  function selectTab(next: AppTab) {
    if (next === tab) return
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', next)
    router.replace(`/?${params.toString()}`, { scroll: false })
  }

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
        contactName: label?.name ?? view.contactLabels[contactId]?.name ?? 'Profilo',
        company: label?.company ?? view.contactLabels[contactId]?.company ?? '',
        clickedAt,
      },
      view.timezone,
    )
    setMine((current) => applyOpening(current, opening, view.timezone))
  }

  function confirmOpen(card: CardView) {
    if (armTimer.current) window.clearTimeout(armTimer.current)
    armTimer.current = null
    setArmedId(null)
    hideContact(card.id)
    rememberOwnOpening(card.id, new Date().toISOString(), { name: card.name, company: card.company })
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
        if (row.team_member_id === view.memberId) {
          rememberOwnOpening(row.contact_id, row.clicked_at ?? new Date().toISOString())
        }
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [view.memberId, view.timezone])

  const visibleCards = view.cards.filter((card) => !hiddenIds.has(card.id))

  return (
    <main className="wrap">
      <a className="skip" href="#lista">
        Vai alla lista
      </a>
      <div className="toolbar">
        <p className="hello">
          Ciao <strong>{view.memberName}</strong>
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

      {tab === 'utilizzo' ? <UsagePanel unavailable={usage.unavailable} counts={mine.counts} recent={mine.recent} /> : null}

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

      {tab === 'elenco' && view.beforeStart ? (
        <section className="card" id="lista">
          <h2 className="name">Il piano parte il {view.startLabel}</h2>
          <p className="role">Oggi non ci sono profili da aprire.</p>
        </section>
      ) : null}

      {tab === 'elenco' && !view.beforeStart && visibleCards.length === 0 ? (
        <section className="card" id="lista">
          <h2 className="name">Oggi la lista è vuota</h2>
          <p className="role">
            I profili già aperti o già usciti restano in pausa {view.cooldownDays} giorni e possono andare al massimo a{' '}
            {view.maxMembersPerContact} persone del team.
          </p>
        </section>
      ) : null}

      {tab === 'elenco' && !view.beforeStart && visibleCards.length > 0 ? (
        <section id="lista" aria-labelledby="lista-title">
          <h1 className="list-title" id="lista-title">
            {profileCount(visibleCards.length)}
          </h1>
          <div className="cards">
            {visibleCards.map((card) => (
              <article className="card" key={card.id}>
                {card.company ? (
                  <p className="company">
                    <BuildingIcon />
                    <span>{card.company}</span>
                  </p>
                ) : null}
                <h3 className="name">{card.name}</h3>
                {card.role ? <p className="role">{card.role}</p> : null}
                <div className="card-action">
                  <ProfileLink
                    card={card}
                    newTab={newTab}
                    armed={armedId === card.id}
                    onArm={() => arm(card.id)}
                    onConfirm={() => confirmOpen(card)}
                  />
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  )
}

function ProfileLink({
  card,
  newTab,
  armed,
  onArm,
  onConfirm,
}: {
  card: CardView
  newTab: boolean
  armed: boolean
  onArm: () => void
  onConfirm: () => void
}) {
  const company = card.company ? `, ${card.company}` : ''
  return (
    <a
      className={armed ? 'primary arming' : 'primary'}
      href={card.linkedinUrl}
      target={newTab ? '_blank' : undefined}
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
      aria-label={
        armed
          ? `Tocca di nuovo per aprire il profilo LinkedIn di ${card.name}${company}`
          : `Apri il profilo LinkedIn di ${card.name}${company}`
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
      <OpenMark />
      <span className="btn-label">{armed ? 'Tocca di nuovo per aprire' : 'Apri su LinkedIn'}</span>
    </a>
  )
}

function UsagePanel({
  unavailable,
  counts,
  recent,
}: {
  unavailable: boolean
  counts: UsageCounts
  recent: UsageView['recent']
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
        {recent.map((item) => (
          <article className="card" key={`${item.contactId}-${item.clickedAt}`}>
            <h2 className="name">{item.contactName}</h2>
            {item.company ? <p className="role">{item.company}</p> : null}
            <p className="when">{item.whenLabel}</p>
          </article>
        ))}
      </div>
    </section>
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

function OpenMark() {
  return (
    <svg className="mark" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        fill="currentColor"
        d="M14 5h5v5h-2V8.4l-7.3 7.3-1.4-1.4L15.6 7H14V5zM5 7h6v2H7v8h8v-4h2v6H5V7z"
      />
    </svg>
  )
}

function profileCount(count: number): string {
  return count === 1 ? '1 profilo' : `${count} profili`
}
