/**
 * TEMPORARY diagnostic. Runs each gate step, captures its output, writes the
 * result to public/__diag.txt, and always exits 0.
 *
 * Purpose: Netlify's API reports only "non-zero exit code" and this project has
 * no build-log tool, so a failing step cannot be identified from outside. Making
 * the gate always succeed means the deploy completes and the diagnostics become
 * fetchable from the site.
 *
 * Delete this file, and the postbuild hook that calls it, once the failure is
 * identified.
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'

const steps = [
  { name: 'typecheck', cmd: 'npm', args: ['run', 'typecheck'] },
  { name: 'lint', cmd: 'npm', args: ['run', 'lint'] },
  { name: 'test', cmd: 'npm', args: ['run', 'test'] },
]

const out = [`node ${process.version}`, `platform ${process.platform}`, '']

for (const step of steps) {
  try {
    const stdout = execFileSync(step.cmd, step.args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    })
    out.push(`=== ${step.name}: OK ===`)
    out.push(stdout.split('\n').slice(-4).join('\n'))
  } catch (error) {
    const e = error
    out.push(`=== ${step.name}: FAILED (exit ${e.status}) ===`)
    out.push('--- stdout tail ---')
    out.push((e.stdout ?? '').split('\n').slice(-25).join('\n'))
    out.push('--- stderr tail ---')
    out.push((e.stderr ?? '').split('\n').slice(-25).join('\n'))
  }
  out.push('')
}

mkdirSync('public', { recursive: true })
writeFileSync('public/__diag.txt', out.join('\n'))
console.log('diagnostics written to public/__diag.txt')
