'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { requestPasswordReset, type ActionState } from '../actions'

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    requestPasswordReset,
    {},
  )

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Reset password</h2>

      {state.success && (
        <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700">
          {state.success}
        </p>
      )}

      {!state.success && (
        <>
          {state.error && (
            <p
              role="alert"
              className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
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

          <button
            type="submit"
            disabled={pending}
            className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50"
          >
            {pending ? 'Sending…' : 'Send reset link'}
          </button>
        </>
      )}

      <Link href="/login" className="text-sm underline">
        Back to sign in
      </Link>
    </form>
  )
}
