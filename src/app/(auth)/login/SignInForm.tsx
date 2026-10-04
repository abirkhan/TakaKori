'use client'

import Link from 'next/link'
import { Suspense, useActionState } from 'react'
import { signIn, type ActionState } from '../actions'
import { Alert } from '@/components/ui/Alert'
import { PasswordField, TextField } from '@/components/ui/Field'
import { buttonClass } from '@/components/ui/button'
import { GoogleMark } from './GoogleMark'

export function SignInForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(signIn, {})

  return (
    <div className="flex flex-col gap-5">
      <form action={formAction} className="flex flex-col gap-4">
        <div>
          <h1 className="tk-title">Welcome back</h1>
          <p className="tk-caption mt-1.5">Sign in to pick up where you left off.</p>
        </div>

        {state.error && <Alert tone="error">{state.error}</Alert>}

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
          autoComplete="current-password"
          required
          error={state.fieldErrors?.password}
        />

        <button
          type="submit"
          disabled={pending}
          className={buttonClass('primary', { block: true })}
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>

        <Link href="/forgot-password" className="tk-caption self-center underline">
          Forgot password?
        </Link>
      </form>

      <Suspense fallback={null}>
        <OAuthDivider />
      </Suspense>

      <p className="tk-caption text-center">
        New here?{' '}
        <Link href="/signup" className="text-accent font-semibold">
          Create an account
        </Link>
      </p>
    </div>
  )
}

/**
 * The OAuth divider is behind a Suspense boundary because `useSearchParams`
 * suspends during static rendering. Without it the whole login route becomes
 * dynamic for no benefit — the redirect parameters are optional.
 */
function OAuthDivider() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="tk-divider flex-1" />
        <span className="tk-caption">or</span>
        <span className="tk-divider flex-1" />
      </div>
      <a href="/auth/login/google" className={buttonClass('quiet', { block: true })}>
        <GoogleMark />
        Continue with Google
      </a>
    </div>
  )
}
