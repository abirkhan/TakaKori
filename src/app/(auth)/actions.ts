'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { REMEMBER_COOKIE, rememberCookieOptions, rememberFromForm } from '@/lib/supabase/remember'
import { siteUrl } from '@/lib/site-url'

/**
 * Auth server actions.
 *
 * Note what is absent: no `userId` parameter anywhere. The acting user is always
 * derived from the verified session on the server. Accepting a user id from the
 * client would make every one of these actions an IDOR waiting to happen.
 */

export interface ActionState {
  error?: string
  success?: string
  /** Field-level messages, keyed by input name. */
  fieldErrors?: Record<string, string>
}

const emailSchema = z.email('Enter a valid email address')
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password is too long') // bcrypt truncates beyond 72 bytes

const signUpSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    fullName: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
  })
  .refine((v) => v.password.length >= 8, {
    message: 'Password must be at least 8 characters',
    path: ['password'],
  })

export async function signUp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    fullName: formData.get('fullName'),
  })

  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string> }
  }

  const { email, password, fullName } = parsed.data
  const supabase = await createClient()

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Read by the provisioning trigger to create the profile and workspace.
      data: { full_name: fullName },
      // The confirmation link lands here with the token in the URL fragment,
      // which the browser client picks up and turns into cookies. This works
      // with Supabase's default email template — no dashboard changes needed.
      //
      // A more robust server-side alternative is to change the "Confirm signup"
      // template to send `?token_hash={{ .TokenHash }}&type=email` and point
      // this at /auth/confirm instead. See src/app/auth/confirm/route.ts.
      emailRedirectTo: `${siteUrl()}/auth/callback`,
    },
  })

  if (error) {
    // Supabase reports a generic message for an existing email to avoid
    // account enumeration. Passing the raw error through would undo that.
    if (/already registered|already exists/i.test(error.message)) {
      return {
        error: 'An account with that email already exists. Try signing in instead.',
      }
    }
    return { error: error.message }
  }

  // No error means the user was created. If email confirmation is enabled they
  // must verify before they can sign in; the session is null in that case.
  return { success: 'Account created. Check your email to confirm your address.' }
}

const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password'),
})

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string> }
  }

  /**
   * The preference is written **before** `createClient()`.
   *
   * This ordering is load-bearing and not obvious. `createClient` reads
   * `tk.remember` when it is constructed, because that is where it learns whether
   * to stamp a 30-day life onto the session cookies auth-js is about to write. Set
   * it afterwards and the first sign-in silently ignores the checkbox — the kind of
   * bug that reads as "remember me just doesn't work" with nothing in the logs.
   *
   * A failed sign-in still persists the preference, which is deliberate: a user
   * who mistypes their password and had ticked the box should not have to tick it
   * again on the retry.
   */
  const remember = rememberFromForm(formData)
  const cookieStore = await cookies()
  cookieStore.set(REMEMBER_COOKIE, remember ? '1' : '0', rememberCookieOptions())

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)

  if (error) {
    // Deliberately vague: distinguishing "no such user" from "wrong password"
    // lets an attacker enumerate which addresses have accounts.
    return { error: 'Incorrect email or password.' }
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()

  // The preference goes too. Leaving it would mean the *next* sign-in defaults to
  // persistent on a machine whose owner had deliberately switched it off, with
  // nothing on screen explaining why.
  const cookieStore = await cookies()
  cookieStore.delete(REMEMBER_COOKIE)

  revalidatePath('/', 'layout')
  redirect('/login')
}

export async function requestPasswordReset(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = emailSchema.safeParse(formData.get('email'))
  if (!parsed.success) {
    return { fieldErrors: { email: 'Enter a valid email address' } }
  }

  const supabase = await createClient()
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${siteUrl()}/auth/reset-password`,
  })

  // Always the same response, whether or not the address exists.
  return {
    success: 'If that address has an account, a reset link is on its way.',
  }
}
