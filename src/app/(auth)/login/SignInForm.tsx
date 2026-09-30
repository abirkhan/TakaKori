'use client'

import Link from 'next/link'
import { Suspense, useActionState } from 'react'
import { signIn, type ActionState } from '../actions'

export function SignInForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(signIn, {})

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Sign in</h2>

        {state.error && (
          <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </p>
        )}

        <label className="flex flex-col gap-1 text-sm">
          <span>Email</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            className="rounded border border-neutral-300 px-3 py-2"
          />
          {state.fieldErrors?.email && (
            <span className="text-xs text-red-600">{state.fieldErrors.email}</span>
          )}
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>Password</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            className="rounded border border-neutral-300 px-3 py-2"
          />
          {state.fieldErrors?.password && (
            <span className="text-xs text-red-600">{state.fieldErrors.password}</span>
          )}
        </label>

        <button
          type="submit"
          disabled={pending}
          className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50"
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>

        <div className="flex justify-between text-sm">
          <Link href="/signup" className="underline">
            Create an account
          </Link>
          <Link href="/forgot-password" className="underline">
            Forgot password?
          </Link>
        </div>
      </form>

      <Suspense fallback={null}>
        <OAuthDivider />
      </Suspense>
    </div>
  )
}

function OAuthDivider() {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex w-full items-center gap-3 text-sm text-neutral-400">
        <span className="h-px flex-1 bg-neutral-200" />
        or
        <span className="h-px flex-1 bg-neutral-200" />
      </div>
      <a
        href="/auth/login/google"
        className="flex w-full items-center justify-center gap-2 rounded border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
      >
        <GoogleMark />
        Continue with Google
      </a>
    </div>
  )
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.45a5.5 5.5 0 0 1-2.39 3.61v3h3.86c2.26-2.08 3.58-5.15 3.58-8.79Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.86-3c-1.08.72-2.45 1.16-4.08 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.29a12 12 0 0 0 0 10.78l3.98-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.61l3.98 3.1C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  )
}