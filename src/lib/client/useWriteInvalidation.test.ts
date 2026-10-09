import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { invalidationKey } from './useWriteInvalidation'

/**
 * Two properties, one behavioural and one structural.
 *
 * The behavioural one is the bug this hook shipped with: it guarded on the action's
 * success value alone, and two consecutive successful writes of the same kind return the
 * *same string*. So the second write in a session invalidated nothing, and the screen kept
 * serving the figure from before it — a stale balance next to a row list that had
 * correctly updated. Half the screen being right is what makes that so hard to spot.
 *
 * The structural one exists because the unit suite runs in node with no DOM, so the hook
 * cannot be mounted to prove the first property end to end. It also catches the failure
 * mode an optional `attempt` argument would have had: a new call site that simply
 * forgets it, silently restoring the bug, with no type error and no test failure anywhere.
 */
describe('invalidationKey', () => {
  it('separates two writes that returned the same message', () => {
    // "Correction recorded", twice, in one session. The messages are identical because
    // they are written for a human, and a human does not need to be told which one.
    expect(invalidationKey('Correction recorded', 1)).not.toBe(
      invalidationKey('Correction recorded', 2),
    )
  })

  it('is stable for the same write, so a re-render does not re-invalidate', () => {
    // The ref exists so a parent re-rendering cannot leave every cached read permanently
    // missing.
    expect(invalidationKey('Saved', 3)).toBe(invalidationKey('Saved', 3))
  })

  it('separates different messages at the same attempt', () => {
    expect(invalidationKey('Saved', 1)).not.toBe(invalidationKey('Deleted.', 1))
  })

  it('does not collide when a message itself contains the separator', () => {
    // Built by concatenation, so this is worth pinning rather than assuming.
    expect(invalidationKey('a 1', 1)).not.toBe(invalidationKey('a', 1))
  })
})

/** Every `.tsx` under `src/components`. */
function componentFiles(dir = join(process.cwd(), 'src', 'components')): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return componentFiles(full)
    return full.endsWith('.tsx') ? [full] : []
  })
}

describe('every useWriteInvalidation call site', () => {
  const callSites = componentFiles().flatMap((file) => {
    const src = readFileSync(file, 'utf8')
    const out: { file: string; call: string }[] = []
    // Match the call and everything up to its closing paren on one line, which is how
    // every call site in this codebase is written.
    for (const m of src.matchAll(/useWriteInvalidation\(([^)]*)\)/g)) {
      out.push({ file: file.replace(process.cwd() + '\\', ''), call: m[1] })
    }
    return out
  })

  it('finds the call sites', () => {
    // A silent zero here would make every assertion below vacuous, which is the failure
    // mode a source-scanning test has and a rendering one does not.
    expect(callSites.length).toBeGreaterThan(10)
  })

  it('passes an attempt counter, so two identical successes are not collapsed', () => {
    const missing = callSites.filter((c) => c.call.split(',').length < 3)
    expect(
      missing.map((c) => `${c.file}: useWriteInvalidation(${c.call})`),
      'these call sites would swallow every write after the first',
    ).toEqual([])
  })
})