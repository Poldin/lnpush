'use client'

import { useEffect, useState } from 'react'

import { todayIso } from '../lib/dates'
import type { CardView, Plan } from '../lib/types'

const STORAGE_KEY = 'newtwen-oggi-member'
// Same-tab on phones so the OS can hand https://www.linkedin.com/in/... to the LinkedIn app.
// A new tab breaks that handoff. Wide screens with a mouse keep the list open in this tab's sibling.
const DESKTOP_LINK = '(min-width: 900px) and (pointer: fine)'

export function TodayApp({ plan, gateEnabled }: { plan: Plan; gateEnabled: boolean }) {
  const [ready, setReady] = useState(false)
  const [memberId, setMemberId] = useState<string | null>(null)
  const [newTab, setNewTab] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_LINK)
    const applyTab = () => setNewTab(media.matches)
    applyTab()
    media.addEventListener('change', applyTab)

    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved && plan.members.some((member) => member.id === saved)) {
      setMemberId(saved)
    } else if (plan.members.length === 1) {
      setMemberId(plan.members[0]?.id ?? null)
    }
    setReady(true)

    return () => media.removeEventListener('change', applyTab)
  }, [plan.members])

  useEffect(() => {
    const checkDay = () => {
      if (todayIso(plan.timezone) !== plan.isoDate) window.location.reload()
    }
    const id = window.setInterval(checkDay, 60000)
    document.addEventListener('visibilitychange', checkDay)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', checkDay)
    }
  }, [plan.isoDate, plan.timezone])

  function choose(id: string) {
    window.localStorage.setItem(STORAGE_KEY, id)
    setMemberId(id)
  }

  function changePerson() {
    window.localStorage.removeItem(STORAGE_KEY)
    setMemberId(null)
  }

  async function logout() {
    await fetch('/api/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  const member = plan.members.find((item) => item.id === memberId) ?? null
  const cards = member ? (plan.cardsByMember[member.id] ?? []) : []

  return (
    <main className="wrap">
      <a className="skip" href="#lista">
        Vai alla lista
      </a>

      {ready && (member || gateEnabled) ? (
        <div className="toolbar">
          {member ? (
            <p className="hello">
              Ciao <strong>{member.name}</strong>
            </p>
          ) : null}
          <div className="toolbar-actions">
            {member && plan.members.length > 1 ? (
              <button className="ghost" type="button" onClick={changePerson}>
                Cambia
              </button>
            ) : null}
            {gateEnabled ? (
              <button className="ghost" type="button" onClick={logout}>
                Esci
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {!ready ? <p className="status">Caricamento…</p> : null}

      {ready && plan.members.length === 0 ? (
        <section className="card" id="lista">
          <h2 className="name">Manca il team</h2>
          <p className="role">Aggiungi le persone in data/team.json.</p>
        </section>
      ) : null}

      {ready && !member && plan.members.length > 0 ? (
        <section id="lista">
          <h1 className="screen-title">Chi sei?</h1>
          <p className="lede">Tocca il tuo nome. Resta memorizzato su questo telefono.</p>
          <div className="names">
            {plan.members.map((item) => (
              <button key={item.id} className="choice" type="button" onClick={() => choose(item.id)}>
                <span>{item.name}</span>
                <span className="chev" aria-hidden="true">
                  ›
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {ready && member && cards.length === 0 ? <EmptyState plan={plan} /> : null}

      {ready && member && cards.length > 0 ? (
        <section id="lista" aria-labelledby="lista-title">
          <h1 className="list-title" id="lista-title">
            {profileCount(cards.length)}
          </h1>
          <div className="cards">
            {cards.map((card) => (
              <article className="card" key={card.id}>
                {card.company ? <p className="company">{card.company}</p> : null}
                <h3 className="name">{card.name}</h3>
                {card.role ? <p className="role">{card.role}</p> : null}
                {card.group ? <p className="pill">{card.group}</p> : null}
                <div className="card-action">
                  <p className="suggest">Suggerimento</p>
                  <ProfileLink card={card} newTab={newTab} />
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  )
}

function EmptyState({ plan }: { plan: Plan }) {
  if (plan.beforeStart) {
    return (
      <section className="card" id="lista">
        <h2 className="name">Il piano parte il {plan.startLabel}</h2>
        <p className="role">Oggi non ci sono profili da aprire.</p>
      </section>
    )
  }
  return (
    <section className="card" id="lista">
      <h2 className="name">Oggi la lista è vuota</h2>
      <p className="role">
        I profili già usciti restano in pausa {plan.cooldownDays} giorni e possono andare al massimo a{' '}
        {plan.maxMembersPerContact} persone del team. Per i prossimi giorni servono altri contatti con un profilo
        LinkedIn.
      </p>
    </section>
  )
}

function ProfileLink({ card, newTab }: { card: CardView; newTab: boolean }) {
  const company = card.company ? `, ${card.company}` : ''
  return (
    <a
      className="primary"
      href={card.linkedinUrl}
      target={newTab ? '_blank' : undefined}
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
      aria-label={`Apri il profilo LinkedIn di ${card.name}${company}. Suggerimento: ${card.action}`}
    >
      <OpenMark />
      <span className="btn-copy">
        <strong>{card.action}</strong>
        <small>Apri su LinkedIn</small>
      </span>
    </a>
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
