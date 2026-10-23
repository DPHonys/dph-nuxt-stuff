// PROTOTYPE (ticket 10), question 4: instantiation counts for the cost app,
// flag on and off, at 51 and 201 routes. For each (routes, engine):
//   base     - the app's own types only (.nuxt/nuxt.d.ts)
//   calls    - base + the ported September call-site program
//   control  - base + the errors parent's `.try` (TryResultFor) and nothing else
//   one-*    - base + one call statement (ours, ours `.try`, vanilla `$fetch`):
//              TS2589 fires when one statement passes 5,000,000 instantiations
// and an order check of `calls` (scripts/order-check.mjs).
// Usage: node scripts/cost.mjs [gen...]   (default: 45 195)
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const app = join(root, 'cost')
const gens = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['45', '195']

function writeGen(n) {
  const dir = join(app, 'server/api/gen')
  rmSync(dir, { recursive: true, force: true })
  for (let i = 0; i < n; i++) {
    mkdirSync(join(dir, String(i)), { recursive: true })
    writeFileSync(
      join(dir, String(i), '[id].get.ts'),
      `export { default } from '../../${i % 2 ? 'users.get' : 'plain.get'}'\n`
    )
    writeFileSync(
      join(dir, String(i), '[id].post.ts'),
      `export { default } from '../../users.post'\n`
    )
  }
}

function tsc(project) {
  const r = spawnSync(
    join(root, 'node_modules/.bin/tsc'),
    ['-p', project, '--extendedDiagnostics'],
    { encoding: 'utf8' }
  )
  const out = r.stdout + r.stderr
  const num = (k) => out.match(new RegExp(`${k}:\\s+([\\d.]+)`))?.[1]
  const codes = [...out.matchAll(/error (TS\d+)/g)].map((m) => m[1])
  const count = (c) => codes.filter((x) => x === c).length
  return {
    instantiations: Number(num('Instantiations')),
    check: `${num('Check time')}s`,
    ts2321: count('TS2321'),
    ts2589: count('TS2589'),
    other: codes.length - count('TS2321') - count('TS2589'),
    first: out
      .split('\n')
      .filter((l) => l.includes('error TS'))
      .slice(0, 3),
  }
}

const rows = []
for (const gen of gens) {
  writeGen(Number(gen))
  for (const mode of ['off', 'on']) {
    const env = {
      ...process.env,
      ROUTE_TYPED_FETCH: mode === 'on' ? '1' : '0',
      GEN_ROUTES: gen,
    }
    execFileSync(join(root, 'node_modules/.bin/nuxt'), ['prepare', 'cost'], {
      cwd: root,
      env,
      stdio: 'ignore',
    })
    const build = `.nuxt-${mode}-${gen}`
    const variants = {
      base: [],
      calls: ['./checks/request-typing.ts'],
      control: ['./control/checked-try.ts'],
      'one-call': ['./probe/one-call.ts'],
      'one-try': ['./probe/one-try.ts'],
      'one-vanilla': ['./probe/one-vanilla.ts'],
    }
    for (const [variant, files] of Object.entries(variants)) {
      const project = join(app, `tsconfig.${mode}-${gen}.${variant}.json`)
      writeFileSync(
        project,
        `${JSON.stringify({ extends: `./${build}/tsconfig.app.json`, include: [`./${build}/nuxt.d.ts`, ...files] }, null, 2)}\n`
      )
      const r = tsc(project)
      let order = ''
      if (variant === 'calls') {
        const o = spawnSync(
          'node',
          [join(root, 'scripts/order-check.mjs'), project],
          { encoding: 'utf8' }
        )
        order = o.stdout
          .split('\n')
          .filter((l) => l.startsWith('call-site'))
          .map((l) => l.replace(/\t/g, ' '))
          .join(' | ')
      }
      rows.push({ routes: Number(gen) + 6, engine: mode, variant, ...r, order })
      console.error(JSON.stringify(rows.at(-1)))
    }
  }
}
console.log(
  '| routes | engine | program | instantiations | check | TS2321 | TS2589 | other |'
)
console.log('|---|---|---|---|---|---|---|---|')
for (const r of rows)
  console.log(
    `| ${r.routes} | ${r.engine === 'on' ? 'generated (flag on)' : 'internal-api (flag off)'} | ${r.variant} | ${r.instantiations.toLocaleString('en-US')} | ${r.check} | ${r.ts2321} | ${r.ts2589} | ${r.other} |`
  )
console.log('\nOrder check of `calls` (each root file checked first):')
for (const r of rows.filter((x) => x.order))
  console.log(`- ${r.routes} routes, ${r.engine}: ${r.order}`)
