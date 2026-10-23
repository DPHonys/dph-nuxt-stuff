// PROTOTYPE (ticket 10). `nuxt prepare` the fixture app twice: flag on
// (.nuxt-on, the generated engine) and flag off (.nuxt-off, InternalApi).
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
for (const flag of ['1', '0']) {
  execFileSync(join(root, 'node_modules/.bin/nuxt'), ['prepare', 'fixture'], {
    cwd: root,
    env: { ...process.env, ROUTE_TYPED_FETCH: flag },
    stdio: 'inherit',
  })
}
