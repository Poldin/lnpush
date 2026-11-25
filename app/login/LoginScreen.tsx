'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'

import { createBrowserSupabase } from '../../lib/supabase/browser'
import { withTab, type AppTab } from '../../lib/tabs'

const LINK_EMAIL_KEY = 'lnpush-link-email'

export function LoginScreen({ sent, errorCode, tab }: { sent: boolean; errorCode: string; tab: AppTab }) {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState(initialMessage(errorCode))
  const [pending, setPending] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(sent)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const ignoreClose = useRef(false)

  useEffect(() => {
    if (!sent) return
    const saved = window.sessionStorage.getItem(LINK_EMAIL_KEY)
    if (saved) setEmail(saved)
  }, [sent])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (previewOpen && !dialog.open) dialog.showModal()
    if (!previewOpen && dialog.open) dialog.close()
    return () => {
      if (!dialog.open) return
      ignoreClose.current = true
      dialog.close()
    }
  }, [previewOpen])

  async function sendLink(address: string) {
    const trimmed = address.trim()
    setPending(true)
    setMessage('')
    try {
      const check = await fetch('/api/auth/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      })
      const body = (await check.json()) as { error?: string }
      if (!check.ok) {
        setMessage(body.error ?? 'Could not send the link.')
        setPending(false)
        return
      }
      const supabase = createBrowserSupabase()
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
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
      window.sessionStorage.setItem(LINK_EMAIL_KEY, trimmed)
      window.location.href = withTab('/login?sent=1', tab)
    } catch {
      setMessage('Connection failed. Try again.')
      setPending(false)
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void sendLink(email)
  }

  function closePreview() {
    setPreviewOpen(false)
  }

  function useDifferentEmail() {
    window.sessionStorage.removeItem(LINK_EMAIL_KEY)
    setEmail('')
    setPreviewOpen(false)
    window.setTimeout(() => document.getElementById('email')?.focus(), 0)
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
      <dialog
        className="mail-preview"
        ref={dialogRef}
        aria-labelledby="mail-preview-title"
        onClose={() => {
          if (ignoreClose.current) {
            ignoreClose.current = false
            return
          }
          setPreviewOpen(false)
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closePreview()
        }}
      >
        <p className="mail-kicker" id="mail-preview-title">
          Preview, not your inbox
        </p>
        <article className="inbox-row" aria-hidden="true">
          <div className="inbox-top">
            <p className="inbox-from">lnpush</p>
            <p className="inbox-time">now</p>
          </div>
          <p className="inbox-address">noreply@kilowattebanane.it</p>
          <p className="inbox-subject">Your sign-in link</p>
          <p className="inbox-snippet">Open this message and tap the link to sign in on this phone.</p>
        </article>
        <p className="mail-note">Check your inbox. If you don't see it, look in Spam, Junk, or Promotions/Other.</p>
        <div className="mail-actions">
          <button className="primary" type="button" onClick={() => void sendLink(email)} disabled={pending || email.trim().length === 0}>
            Resend
          </button>
          <button className="ghost" type="button" onClick={useDifferentEmail}>
            Use a different email
          </button>
          <button className="linkish" type="button" onClick={closePreview}>
            Close
          </button>
        </div>
      </dialog>
    </>
  )

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
}

function initialMessage(errorCode: string): string {
  if (errorCode === 'link') return 'That link is no longer valid. Ask for a new one.'
  if (errorCode === 'team') return 'This email is not on the team.'
  return ''
}
