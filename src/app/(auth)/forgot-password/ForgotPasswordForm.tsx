'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { requestPasswordReset, type ActionState } from '../actions'
import { Alert } from '@/components/ui/Alert'
import { TextField } from '@/components/ui/Field'
import { buttonClass } from '@/components/ui/button'

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    requestPasswordReset,
    {},
  )

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <h1 className="tk-title">Reset password</h1>
        <p className="tk-caption mt-1.5">We will email you a link to set a new one.</p>
      </div>

      {state.success && <Alert tone="success">{state.success}</Alert>}

      {!state.success && (
        <>
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

          <button
            type="submit"
            disabled={pending}
            className={buttonClass('primary', { block: true })}
          >
            {pending ? 'Sending…' : 'Send reset link'}
          </button>
        </>
      )}

      <Link href="/login" className="tk-caption self-center underline">
        Back to sign in
      </Link>
    </form>
  )
}
