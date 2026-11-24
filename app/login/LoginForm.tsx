'use client'

import { useState, type FormEvent } from 'react'

export function LoginForm() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!response.ok) {
        setError('Password non corretta.')
        setPending(false)
        return
      }
      window.location.href = '/'
    } catch {
      setError('Connessione non riuscita. Riprova.')
      setPending(false)
    }
  }

  return (
    <form className="login" onSubmit={onSubmit}>
      <label htmlFor="password">Password del team</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="go"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
      <button className="primary center" type="submit" disabled={pending}>
        {pending ? 'Controllo…' : 'Entra'}
      </button>
    </form>
  )
}
