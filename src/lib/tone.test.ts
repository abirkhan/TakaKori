import { describe, it, expect } from 'vitest'
import { toneFor, TONES } from '@/lib/tone'

describe('toneFor', () => {
  it('returns the same tone for the same name, every time', () => {
    // The whole point of deriving a colour from the name: a category must not
    // change colour between two renders of the same grid.
    expect(toneFor('Groceries')).toBe(toneFor('Groceries'))
    expect(toneFor('Rent')).toBe(toneFor('Rent'))
  })

  it('is case-insensitive in the way a name comparison would be', () => {
    expect(toneFor('groceries')).toBe(toneFor('Groceries'))
  })

  it('only ever returns a declared tone', () => {
    const names = ['Food', 'Rent', 'Salary', 'Transport', 'Health', 'Phone', 'Other']
    for (const name of names) {
      expect(TONES).toContain(toneFor(name))
    }
  })

  it('spreads across the palette rather than pinning everything to one hue', () => {
    const names = ['Food', 'Rent', 'Salary', 'Transport', 'Health', 'Phone', 'Other']
    const distinct = new Set(names.map(toneFor))
    // Not a strict distribution guarantee — the hash could collide — but a
    // grid where every category is one colour would be a visible failure, so
    // this asserts the palette is actually reachable.
    expect(distinct.size).toBeGreaterThan(1)
  })

  it('handles an empty name without throwing', () => {
    expect(TONES).toContain(toneFor(''))
  })
})
