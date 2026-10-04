'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Alert } from '@/components/ui/Alert'
import { PasswordField } from '@/components/ui/Field'
import { buttonClass } from '@/components/ui/button'

/**
 * Password reset form.
 *
 * The link lands here with a recovery session already established by Supabase's
 * callback, so this only needs to set the new password.
 */
export function ResetPasswordForm() {
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const password = String(data.get('password') ?? '')
    const confirm = String(data.get('confirm') ?? '')

    if (password.length < 8) {
      setStatus('error')
      setMessage('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setStatus('error')
      setMessage('Passwords do not match.')
      return
    }

    setStatus('busy')
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setStatus('error')
      setMessage(
        error.message.includes('Auth session')
          ? 'This reset link has expired. Request a new one.'
          : error.message,
      )
      return
    }

    setStatus('done')
    setMessage('Password updated. Redirecting…')
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div>
        <h1 className="tk-title">Set a new password</h1>
        <p className="tk-caption mt-1.5">Then you will be signed in.</p>
      </div>

      {status === 'error' && <Alert tone="error">{message}</Alert>}
      {status === 'done' && <Alert tone="success">{message}</Alert>}

      <PasswordField
        name="password"
        label="New password"
        autoComplete="new-password"
        minLength={8}
        required
      />

      <PasswordField
        name="confirm"
        label="Confirm password"
        autoComplete="new-password"
        minLength={8}
        required
      />

      <button
        type="submit"
        disabled={status === 'busy'}
        className={buttonClass('primary', { block: true })}
      >
        {status === 'busy' ? 'Saving…' : 'Update password'}
      </button>
    </form>
  )
}
