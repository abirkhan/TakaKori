'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { signUp, type ActionState } from '../actions'
import { Alert } from '@/components/ui/Alert'
import { PasswordField, TextField } from '@/components/ui/Field'
import { buttonClass } from '@/components/ui/button'

export function SignUpForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(signUp, {})

  /**
   * Controlled, for the same reason as the sign-in form and with more to lose.
   *
   * React resets uncontrolled fields when a `useActionState` action resolves,
   * including on failure. This form's most likely failure is "that email is
   * already registered" or a password under 8 characters — and the version before
   * this answered either by clearing the name, the address *and* the password, so
   * the user retype the one thing they could not look up.
   */
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  if (state.success) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="tk-title">Check your email</h1>
        <p className="tk-body text-muted">{state.success}</p>
        <Link href="/login" className={buttonClass('soft', { block: true })}>
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <h1 className="tk-title">Create your account</h1>
        <p className="tk-caption mt-1.5">Free, and your records stay yours.</p>
      </div>

      {state.error && <Alert tone="error">{state.error}</Alert>}

      <TextField
        name="fullName"
        label="Name"
        autoComplete="name"
        placeholder="Abir Hossain"
        required
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        error={state.fieldErrors?.fullName}
      />

      <TextField
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={state.fieldErrors?.email}
      />

      <PasswordField
        name="password"
        label="Password"
        autoComplete="new-password"
        minLength={8}
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        hint="At least 8 characters"
        error={state.fieldErrors?.password}
      />

      <button type="submit" disabled={pending} className={buttonClass('primary', { block: true })}>
        {pending ? 'Creating account…' : 'Create account'}
      </button>

      <p className="tk-caption text-center">
        Already have an account?{' '}
        <Link href="/login" className="text-accent font-semibold">
          Sign in
        </Link>
      </p>
    </form>
  )
}
