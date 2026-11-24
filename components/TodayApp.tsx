'use client'

import { useEffect, useState } from 'react'

import { todayIso } from '../lib/dates'
import { createBrowserSupabase } from '../lib/supabase/browser'
import type { CardView, HomeView } from '../lib/types'

// Same-tab on phones so the OS can hand https://www.linkedin.com/in/... to the LinkedIn app.
const DESKTOP_LINK = '(min-width: 900px) and (pointer: fine)'

export function TodayApp({ view }: { view: HomeView }) {
  const [newTab, setNewTab] = useState(false)
  const [opened, setOpened] = useState<Set<string>>(new Set())
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

      {passkey === 'offer' ? (
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
      {passkey === 'done' ? <p className="status">Dispositivo registrato.</p> : null}

      {view.beforeStart ? (
        <section className="card" id="lista">
          <h2 className="name">Il piano parte il {view.startLabel}</h2>
          <p className="role">Oggi non ci sono profili da aprire.</p>
        </section>
      ) : null}

      {!view.beforeStart && view.cards.length === 0 ? (
        <section className="card" id="lista">
          <h2 className="name">Oggi la lista è vuota</h2>
          <p className="role">
            I profili già aperti o già usciti restano in pausa {view.cooldownDays} giorni e possono andare al massimo a{' '}
            {view.maxMembersPerContact} persone del team.
          </p>
        </section>
      ) : null}

      {!view.beforeStart && view.cards.length > 0 ? (
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
                    onOpen={() => {
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
                    }}
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

function ProfileLink({ card, newTab, onOpen }: { card: CardView; newTab: boolean; onOpen: () => void }) {
  const company = card.company ? `, ${card.company}` : ''
  return (
    <a
      className="primary"
      href={card.linkedinUrl}
      target={newTab ? '_blank' : undefined}
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
      aria-label={`Apri il profilo LinkedIn di ${card.name}${company}`}
      onClick={onOpen}
    >
      <OpenMark />
      <span className="btn-label">Apri su LinkedIn</span>
    </a>
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
