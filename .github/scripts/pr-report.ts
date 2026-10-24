/**
 * Renders the Markdown fragments CI posts as one sticky pull request comment.
 *
 *   pr-report.ts jobs <needs-json>        table of every job's result
 *   pr-report.ts lint <oxlint.json> <eslint.txt>
 *   pr-report.ts junit <junit.xml>...
 */
import { readFileSync } from 'node:fs'
import process from 'node:process'

interface JobOutcome {
  result: 'success' | 'failure' | 'cancelled' | 'skipped'
}

interface OxlintReport {
  diagnostics: { severity: 'error' | 'warning' | string }[]
}

const badge = {
  success: '✅ passed',
  failure: '❌ failed',
  cancelled: '⚪ cancelled',
  skipped: '⏭️ skipped',
} satisfies Record<JobOutcome['result'], string>

function jobsTable(needsJson: string): string {
  const needs: Record<string, JobOutcome> = JSON.parse(needsJson)
  const rows = Object.entries(needs).map(
    ([job, outcome]) => `| ${job} | ${badge[outcome.result]} |`
  )
  return ['| Job | Result |', '| --- | --- |', ...rows].join('\n')
}

function lintSummary(oxlintPath: string, eslintPath: string): string {
  const oxlint: OxlintReport = JSON.parse(readFileSync(oxlintPath, 'utf8'))
  const oxlintErrors = oxlint.diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'error'
  ).length
  const oxlintWarnings = oxlint.diagnostics.length - oxlintErrors

  // ESLint's stylish formatter ends with "✖ N problems (E errors, W warnings)"
  // and prints nothing at all when the tree is clean.
  const eslintOutput = readFileSync(eslintPath, 'utf8')
  const eslintTotals = /\((\d+) errors?, (\d+) warnings?\)/.exec(eslintOutput)
  const eslintErrors = Number(eslintTotals?.[1] ?? 0)
  const eslintWarnings = Number(eslintTotals?.[2] ?? 0)

  return [
    '| Linter | Errors | Warnings |',
    '| --- | ---: | ---: |',
    `| Oxlint | ${oxlintErrors} | ${oxlintWarnings} |`,
    `| ESLint | ${eslintErrors} | ${eslintWarnings} |`,
  ].join('\n')
}

interface SuiteTotals {
  tests: number
  failures: number
  errors: number
  skipped: number
}

function junitSummary(paths: string[]): string {
  const rows = paths.map((path) => {
    const totals = readTotals(readFileSync(path, 'utf8'))
    const workspace = path.replace(/\/test-results\/junit\.xml$/, '')
    const passed =
      totals.tests - totals.failures - totals.errors - totals.skipped
    const failed = totals.failures + totals.errors
    const status = failed > 0 ? '❌' : '✅'
    return `| ${status} ${workspace} | ${passed} | ${failed} | ${totals.skipped} |`
  })
  return [
    '| Workspace | Passed | Failed | Skipped |',
    '| --- | ---: | ---: | ---: |',
    ...rows,
  ].join('\n')
}

/** Vitest writes one `<testsuites>` root carrying the file totals. */
function readTotals(xml: string): SuiteTotals {
  const root = /<testsuites\b[^>]*>/.exec(xml)?.[0] ?? ''
  const attribute = (name: string): number =>
    Number(new RegExp(`\\b${name}="(\\d+)"`).exec(root)?.[1] ?? 0)
  return {
    tests: attribute('tests'),
    failures: attribute('failures'),
    errors: attribute('errors'),
    skipped: attribute('skipped'),
  }
}

const [mode, ...rest] = process.argv.slice(2)
switch (mode) {
  case 'jobs':
    console.log(jobsTable(rest[0] ?? '{}'))
    break
  case 'lint':
    console.log(lintSummary(rest[0] ?? '', rest[1] ?? ''))
    break
  case 'junit':
    console.log(junitSummary(rest))
    break
  default:
    console.error(`unknown mode: ${mode ?? '(none)'}`)
    process.exitCode = 1
}
