'use client'

import Link from 'next/link'
import { useState } from 'react'
import { requestPasswordReset, type ActionState } from '../actions'
import { useWriteAction } from '@/lib/client/useWriteAction'
import { Alert } from '@/components/ui/Alert'
import { TextField } from '@/components/ui/Field'
import { buttonClass } from '@/components/ui/button'

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useWriteAction<ActionState>(
    requestPasswordReset,
    {},
  )

  /**
   * Controlled. React resets an uncontrolled field when a `useActionState` action
   * resolves, and this form's realistic failure is a mistyped address — which used
   * to be answered by clearing the address, making the mistype permanent.
   */
  const [email, setEmail] = useState('')

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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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