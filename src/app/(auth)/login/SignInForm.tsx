'use client'

import Link from 'next/link'
import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { signIn, type ActionState } from '../actions'
import { useWriteAction } from '@/lib/client/useWriteAction'
import { Alert } from '@/components/ui/Alert'
import { CheckboxField, PasswordField, TextField } from '@/components/ui/Field'
import { buttonClass } from '@/components/ui/button'
import { GoogleSignIn } from '@/components/app/GoogleSignIn'

export function SignInForm() {
  const [state, formAction, pending] = useWriteAction<ActionState>(signIn, {})

  /**
   * Held here rather than left to the DOM because **two paths sign in, not one.**
   * The password form posts it as a field; the Google button sits outside this
   * `<form>` entirely and has to be told. Leaving the checkbox uncontrolled would
   * let the two paths disagree — tick the box, sign in with Google, get a session
   * cookie anyway — which is the sort of inconsistency nobody notices until they
   * close the browser.
   */
  const [remember, setRemember] = useState(true)

  /**
   * Email and password are **controlled**, and that is the whole reason they are.
   *
   * React resets a form's uncontrolled fields when a `useActionState` action
   * resolves — *including when it fails*. So the version before this typed a wrong
   * password, came back to "Incorrect email or password.", and found both fields
   * blank: the field you cannot guess, and the one you had just got right, both
   * erased, beside an error that does not mention the erasure.
   *
   * Holding the draft in state is what the add and edit sheets already do (see
   * `AddTransactionSheet`), and it is the same rule — brand-design rule 13. There
   * is no sheet here to remount, so state is the mechanism.
   */
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={state.fieldErrors?.email}
        />

        <PasswordField
          name="password"
          label="Password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={state.fieldErrors?.password}
        />

        {/*
          * Checked by default.

          This is a personal tracker that people install to their own phone and use
          on a metered connection, where being signed out every few days is a real
          and repeated cost; and the alternative risk — a shared device keeping a
          session — has no mitigation here beyond the tick itself, which is exactly
          what a visible, labelled checkbox is for. A finance app that defaults to
          *not* remembering is the more usual call, so this is a deliberate choice
          rather than an oversight, and it is one line to flip.

          The hint states the consequence in both directions, because "keep me
          signed in" is otherwise read as a speed convenience when it is actually a
          statement about the cookie's lifetime.
          */}
        <CheckboxField
          name="remember"
          label="Keep me signed in on this device"
          hint="Otherwise you will be signed out when you close the browser."
          checked={remember}
          onChange={setRemember}
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
        <OAuthDivider remember={remember} />
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
function OAuthDivider({ remember }: { remember: boolean }) {
  const next = useSearchParams().get('next')

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="tk-divider flex-1" />
        <span className="tk-caption">or</span>
        <span className="tk-divider flex-1" />
      </div>
      <GoogleSignIn next={next ?? '/dashboard'} remember={remember} />
    </div>
  )
}