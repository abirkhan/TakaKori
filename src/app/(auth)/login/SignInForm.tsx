'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { signIn, type ActionState } from '../actions'

export function SignInForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(signIn, {})

  return (
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
  )
}