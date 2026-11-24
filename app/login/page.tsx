import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { COOKIE_NAME, authToken, configuredPassword, safeEqual } from '../../lib/auth'
import { LoginForm } from './LoginForm'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const password = configuredPassword()
  if (!password) redirect('/')

  const jar = await cookies()
  const token = jar.get(COOKIE_NAME)?.value ?? ''
  if (token && safeEqual(token, await authToken(password))) redirect('/')

  return (
    <main className="wrap">
      <header className="hero">
        <div className="toprow">
          <p className="kicker">Oggi</p>
          <p className="brand">Newtwen</p>
        </div>
        <h1 className="plain-title">Lista del team</h1>
        <p className="lede">Password condivisa. Sul telefono resta memorizzata.</p>
      </header>
      <LoginForm />
    </main>
  )
}
