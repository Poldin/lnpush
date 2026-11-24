'use client'

import { useState, type FormEvent } from 'react'

import { createBrowserSupabase } from '../../lib/supabase/browser'

export function LoginScreen({ sent, errorCode }: { sent: boolean; errorCode: string }) {
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
        setMessage(body.error ?? 'Invio non riuscito.')
        setPending(false)
        return
      }
      const supabase = createBrowserSupabase()
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback`, shouldCreateUser: true },
      })
      if (error) {
        setMessage('Invio non riuscito. Riprova tra poco.')
        setPending(false)
        return
      }
      window.location.href = '/login?inviato=1'
    } catch {
      setMessage('Connessione non riuscita. Riprova.')
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
        setMessage('Nessun dispositivo registrato, oppure il passkey non è attivo. Entra con l’email.')
        setPending(false)
        return
      }
      window.location.href = '/'
    } catch {
      setMessage('Questo browser non apre il dispositivo. Entra con l’email.')
      setPending(false)
    }
  }

  return (
    <>
      <button className="primary center" type="button" onClick={signInWithDevice} disabled={pending}>
        Entra con il dispositivo
      </button>
      <form className="login" onSubmit={onSubmit}>
        <label htmlFor="email">Email del team</label>
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
          {pending ? 'Attendi…' : 'Invia il link'}
        </button>
      </form>
    </>
  )
}

function initialMessage(sent: boolean, errorCode: string): string {
  if (sent) return 'Controlla la posta e apri il link da questo telefono.'
  if (errorCode === 'link') return 'Il link non è più valido. Chiedine uno nuovo.'
  if (errorCode === 'team') return 'Questa email non è nel team.'
  return ''
}
