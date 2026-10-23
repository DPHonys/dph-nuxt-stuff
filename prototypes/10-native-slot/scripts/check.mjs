// PROTOTYPE (ticket 10). Every question-1/2/3/5 check, both engines:
//   tsc over the fixture program (flag on, flag off)
//   the order check (each root file checked first)
//   lib/*.d.ts checked on their own with skipLibCheck off
//   the `Probe_*` types of checks/both/call-sites.ts, diffed on against off
//   the *.spec-d.ts files under vitest typecheck
// Run scripts/prepare.mjs first. Question 4 is scripts/cost.mjs.
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const bin = (name) => join(root, 'node_modules/.bin', name)
let failed = false
function run(label, cmd, args, env = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
  const ok = r.status === 0
  failed ||= !ok
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok)
    console.log(
      (r.stdout + r.stderr).trim().split('\n').slice(0, 30).join('\n')
    )
  return r.stdout
}

const probes = {}
for (const mode of ['on', 'off']) {
  const project = `fixture/tsconfig.${mode}.json`
  run(`tsc ${project}`, bin('tsc'), ['-p', project])
  run(`order check ${project}`, 'node', ['scripts/order-check.mjs', project])
  run(`lib declarations, ${mode}`, 'node', ['scripts/lib-check.mjs', project])
  probes[mode] = run(`probe types, ${mode}`, 'node', [
    'scripts/probe-types.mjs',
    project,
    'fixture/checks/both/call-sites.ts',
  ])
  run(`vitest typecheck, ${mode}`, bin('vitest'), ['run'], {
    ROUTE_TYPED_FETCH: mode === 'on' ? '1' : '0',
  })
}
const same = probes.on === probes.off && !probes.on.includes('DIAG')
failed ||= !same
console.log(
  `${same ? 'PASS' : 'FAIL'}  call-site types identical with the flag on and off`
)
process.exitCode = failed ? 1 : 0
