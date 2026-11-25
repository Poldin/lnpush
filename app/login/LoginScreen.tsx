'use client'

import { useState, type FormEvent } from 'react'

import { createBrowserSupabase } from '../../lib/supabase/browser'
import { withTab, type AppTab } from '../../lib/tabs'

export function LoginScreen({ sent, errorCode, tab }: { sent: boolean; errorCode: string; tab: AppTab }) {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState(initialMessage(sent, errorCode))
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setMessage('')
    try {
      const check = await fetch('/api/auth/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const body = (await check.json()) as { error?: string }
      if (!check.ok) {
        setMessage(body.error ?? 'Could not send the link.')
        setPending(false)
        return
      }
      const supabase = createBrowserSupabase()
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}${withTab('/auth/callback', tab)}`,
          shouldCreateUser: true,
        },
      })
      if (error) {
        setMessage('Could not send the link. Try again in a moment.')
        setPending(false)
        return
      }
      window.location.href = withTab('/login?sent=1', tab)
    } catch {
      setMessage('Connection failed. Try again.')
      setPending(false)
    }
  }

  async function signInWithDevice() {
    setPending(true)
    setMessage('')
    try {
      const supabase = createBrowserSupabase()
      const { error } = await supabase.auth.signInWithPasskey()
      if (error) {
        setMessage('No device is saved, or passkeys are not enabled. Sign in with email.')
        setPending(false)
        return
      }
      window.location.href = withTab('/', tab)
    } catch {
      setMessage('This browser cannot open the device. Sign in with email.')
      setPending(false)
    }
  }

  return (
    <>
      <button className="primary center" type="button" onClick={signInWithDevice} disabled={pending}>
        Sign in with this device
      </button>
      <form className="login" onSubmit={onSubmit}>
        <label htmlFor="email">Team email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username webauthn"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        {message ? (
          <p className="alert" role="status">
            {message}
          </p>
        ) : null}
        <button className="ghost wide" type="submit" disabled={pending}>
          {pending ? 'Please wait…' : 'Send the link'}
        </button>
      </form>
    </>
  )
}

function initialMessage(sent: boolean, errorCode: string): string {
  if (sent) return 'Check your email and open the link on this phone.'
  if (errorCode === 'link') return 'That link is no longer valid. Ask for a new one.'
  if (errorCode === 'team') return 'This email is not on the team.'
  return ''
}
