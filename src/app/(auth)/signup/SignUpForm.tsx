'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { signUp, type ActionState } from '../actions'

export function SignUpForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(signUp, {})

  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Check your email</h2>
        <p className="text-sm text-neutral-600">{state.success}</p>
        <Link href="/login" className="text-sm underline">
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Create an account</h2>

      {state.error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span>Name</span>
        <input
          type="text"
          name="fullName"
          autoComplete="name"
          required
          className="rounded border border-neutral-300 px-3 py-2"
        />
        {state.fieldErrors?.fullName && (
          <span className="text-xs text-red-600">{state.fieldErrors.fullName}</span>
        )}
      </label>

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
          autoComplete="new-password"
          minLength={8}
          required
          className="rounded border border-neutral-300 px-3 py-2"
        />
        <span className="text-xs text-neutral-500">At least 8 characters</span>
        {state.fieldErrors?.password && (
          <span className="text-xs text-red-600">{state.fieldErrors.password}</span>
        )}
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50"
      >
        {pending ? 'Creating account…' : 'Create account'}
      </button>

      <p className="text-sm">
        Already have an account?{' '}
        <Link href="/login" className="underline">
          Sign in
        </Link>
      </p>
    </form>
  )
}