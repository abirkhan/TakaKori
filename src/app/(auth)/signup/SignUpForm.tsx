'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { signUp, type ActionState } from '../actions'
import { Alert } from '@/components/ui/Alert'
import { PasswordField, TextField } from '@/components/ui/Field'
import { buttonClass } from '@/components/ui/button'

export function SignUpForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(signUp, {})

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
        error={state.fieldErrors?.fullName}
      />

      <TextField
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        required
        error={state.fieldErrors?.email}
      />

      <PasswordField
        name="password"
        label="Password"
        autoComplete="new-password"
        minLength={8}
        required
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
