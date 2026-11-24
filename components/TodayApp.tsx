'use client'

import { useEffect, useRef, useState } from 'react'

import { todayIso } from '../lib/dates'
import { createBrowserSupabase } from '../lib/supabase/browser'
import type { CardView, HomeView, UsageView } from '../lib/types'

// Same-tab on phones so the OS can hand https://www.linkedin.com/in/... to the LinkedIn app.
const DESKTOP_LINK = '(min-width: 900px) and (pointer: fine)'

export function TodayApp({ view, usage }: { view: HomeView; usage: UsageView }) {
  const [tab, setTab] = useState<'elenco' | 'utilizzo'>('elenco')
  const [newTab, setNewTab] = useState(false)
  const [opened, setOpened] = useState<Set<string>>(new Set())
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

  function confirmOpen(card: CardView) {
    if (armTimer.current) window.clearTimeout(armTimer.current)
    armTimer.current = null
    setArmedId(null)
    setOpened((current) => {
      const next = new Set(current)
      next.add(card.id)
      return next
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
        <button className={tab === 'elenco' ? 'tab on' : 'tab'} type="button" role="tab" aria-selected={tab === 'elenco'} onClick={() => setTab('elenco')}>
          Elenco
        </button>
        <button className={tab === 'utilizzo' ? 'tab on' : 'tab'} type="button" role="tab" aria-selected={tab === 'utilizzo'} onClick={() => setTab('utilizzo')}>
          Utilizzo
        </button>
      </div>

      {tab === 'utilizzo' ? <UsagePanel usage={usage} /> : null}

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

      {tab === 'elenco' && !view.beforeStart && view.cards.length === 0 ? (
        <section className="card" id="lista">
          <h2 className="name">Oggi la lista è vuota</h2>
          <p className="role">
            I profili già aperti o già usciti restano in pausa {view.cooldownDays} giorni e possono andare al massimo a{' '}
            {view.maxMembersPerContact} persone del team.
          </p>
        </section>
      ) : null}

      {tab === 'elenco' && !view.beforeStart && view.cards.length > 0 ? (
        <section id="lista" aria-labelledby="lista-title">
          <h1 className="list-title" id="lista-title">
            {profileCount(view.cards.length)}
          </h1>
          <div className="cards">
            {view.cards.map((card) => (
              <article className={opened.has(card.id) ? 'card opened' : 'card'} key={card.id}>
                {card.company ? (
                  <p className="company">
                    <BuildingIcon />
                    <span>{card.company}</span>
                  </p>
                ) : null}
                <h3 className="name">{card.name}</h3>
                {card.role ? <p className="role">{card.role}</p> : null}
                {opened.has(card.id) ? <p className="opened-label">Aperto</p> : null}
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

function UsagePanel({ usage }: { usage: UsageView }) {
  if (usage.unavailable) {
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
        Aperture
      </h1>
      <div className="cards">
        {usage.members.map((member) => (
          <article className="card" key={member.name}>
            <h2 className="name">{member.name}</h2>
            <dl className="stats">
              <div>
                <dt>Oggi</dt>
                <dd>{member.today}</dd>
              </div>
              <div>
                <dt>7 giorni</dt>
                <dd>{member.week}</dd>
              </div>
              <div>
                <dt>Totale</dt>
                <dd>{member.total}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
      <h2 className="list-title recent-title">Ultime aperture</h2>
      {usage.recent.length === 0 ? <p className="role">Nessuna apertura ancora.</p> : null}
      <div className="cards">
        {usage.recent.map((item, index) => (
          <article className="card" key={`${item.memberName}-${item.contactName}-${item.whenLabel}-${index}`}>
            <p className="company">
              <span>{item.memberName}</span>
            </p>
            <h3 className="name">{item.contactName}</h3>
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
