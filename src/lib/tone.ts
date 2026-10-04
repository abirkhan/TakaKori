/**
 * A stable categorical hue for a user-defined name.
 *
 * Accounts and categories are user-defined, so there is no id to key a colour
 * off that means anything. Deriving the hue from the *name* gives the property
 * that matters: the same category is the same colour on every screen, across
 * sessions, and for everyone. Deriving it from a row id or from list position
 * instead means adding one category in the middle silently recolours half the
 * grid, and the colours stop meaning anything at all.
 *
 * Six hues, not twelve: past six, adjacent tiles in a grid become hard to
 * tell apart, and the grid is read by scanning rows, not by comparing.
 */

export const TONES = ['brand', 'sky', 'amber', 'rose', 'violet', 'teal'] as const

export type Tone = (typeof TONES)[number]

export function toneFor(name: string): Tone {
  // Lower-cased first, so "Groceries" and "groceries" cannot land on different
  // hues. The unique index on categories is already `lower(name)`, so the two
  // spellings are the same category by the database's own definition and must
  // not be two colours.
  const key = name.trim().toLowerCase()

  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  }
  return TONES[hash % TONES.length]
}
