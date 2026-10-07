'use client'

import Link from 'next/link'
import { Suspense, useActionState } from 'react'
import { useSearchParams } from 'next/navigation'
import { signIn, type ActionState } from '../actions'
import { Alert } from '@/components/ui/Alert'
import { PasswordField, TextField } from '@/components/ui/Field'
import { buttonClass } from '@/components/ui/button'
import { GoogleSignIn } from '@/components/app/GoogleSignIn'

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
 * The OAuth divider, behind a Suspense boundary.
 *
 * `useSearchParams` suspends during static rendering, so reading `next` from it
 * makes the whole login route dynamic. Without this boundary the route is
 * dynamic for no benefit, since the redirect parameters are optional.
 *
 * The trigger is now a client component rather than an `<a href>` to a route
 * handler: PKCE runs entirely in the browser (`GoogleSignIn`), so there is no
 * URL to link to. The trade is that it needs JavaScript — which for an OAuth
 * button is not a real loss, since the flow it starts needs JavaScript either
 * way. `?next=` is still honoured so a deep link survives the round-trip.
 */
function OAuthDivider() {
  const next = useSearchParams().get('next')

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="tk-divider flex-1" />
        <span className="tk-caption">or</span>
        <span className="tk-divider flex-1" />
      </div>
      <GoogleSignIn next={next ?? '/dashboard'} />
    </div>
  )
}
