import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { TodayApp } from '../components/TodayApp'
import { COOKIE_NAME, authToken, configuredPassword, safeEqual } from '../lib/auth'
import { loadPlan } from '../lib/data'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const gateEnabled = await hasAccess()
  try {
    const plan = loadPlan()
    return <TodayApp plan={plan} gateEnabled={gateEnabled} />
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Controlla i file in data/.'
    return (
      <main className="wrap">
        <p className="kicker">Dati</p>
        <h1 className="plain-title">Controlla i file</h1>
        <p className="tip">{message}</p>
      </main>
    )
  }
}

async function hasAccess(): Promise<boolean> {
  const password = configuredPassword()
  if (!password) return false
  const jar = await cookies()
  const token = jar.get(COOKIE_NAME)?.value ?? ''
  if (!token || !safeEqual(token, await authToken(password))) redirect('/login')
  return true
}
