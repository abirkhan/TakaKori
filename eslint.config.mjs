import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Build tooling drops generated trees that are not ours to lint. Netlify
    // in particular downloads the deno CLI and its npm packages into
    // .netlify/plugins/deno-cli/deno_dir/registry.npmjs.org/ before the build
    // command runs, and linting those .d.ts files produced 1230 errors that
    // exist only on the deploy machine. ESLint's flat config does not read
    // .gitignore, so anything a build tool creates has to be listed here.
    '.netlify/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
  ]),
])

export default eslintConfig
