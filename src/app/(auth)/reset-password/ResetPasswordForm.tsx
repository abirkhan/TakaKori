'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

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
      <h2 className="text-lg font-medium">Set a new password</h2>

      {status === 'error' && (
        <p
          role="alert"
          className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {message}
        </p>
      )}
      {status === 'done' && (
        <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700">
          {message}
        </p>
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span>New password</span>
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="rounded border border-neutral-300 px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span>Confirm password</span>
        <input
          type="password"
          name="confirm"
          autoComplete="new-password"
          minLength={8}
          required
          className="rounded border border-neutral-300 px-3 py-2"
        />
      </label>

      <button
        type="submit"
        disabled={status === 'busy'}
        className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50"
      >
        {status === 'busy' ? 'Saving…' : 'Update password'}
      </button>
    </form>
  )
}
