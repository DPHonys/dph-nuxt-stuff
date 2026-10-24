import { eventHandler } from 'h3'
import { describe, expect, it } from 'vitest'
import { routeHandlersOf } from '../../src/build/routes'
import type { HandlerEntry, NitroPathOptions } from '../../src/build/routes'

// The route discovery seam's one piece of arithmetic: Nitro's handler list as
// the renderer reads it. Plain data in, plain data out - the hooks around it
// are proved by the generated map in a real app (`test/e2e/generated-map`).

/** A Nuxt-shaped Nitro: `srcDir` is `<rootDir>/server`, `buildDir` is `.nuxt`. */
const NITRO: NitroPathOptions = {
  buildDir: '/app/.nuxt',
  srcDir: '/app/server',
  alias: { '~': '/app', '@': '/app', '~~': '/app' },
}

/** The specifier one handler path is imported by, from the map's directory. */
function specifierFor(
  handler: string,
  nitro: NitroPathOptions = NITRO
): string | undefined {
  const [found] = routeHandlersOf([{ route: '/r', handler }], nitro)

  return /import\('([^']*)'\)/.exec(found?.handlerType ?? '')?.[1]
}

describe('which handlers are routes', () => {
  it('keeps every route Nitro serves, Nitro’s route key verbatim', () => {
    const entries: HandlerEntry[] = [
      {
        route: '/api/users/:id',
        method: 'get',
        handler: '/app/server/api/users/[id].get.ts',
      },
      {
        route: '/api/files/**:slug',
        handler: '/app/server/api/files/[...slug].ts',
      },
      { route: '/api/**', handler: '/app/server/api/[...].ts' },
    ]

    expect(routeHandlersOf(entries, NITRO)).toEqual([
      {
        route: '/api/users/:id',
        method: 'get',
        handlerType: `typeof import('../../server/api/users/[id].get').default`,
      },
      {
        route: '/api/files/**:slug',
        method: 'default',
        handlerType: `typeof import('../../server/api/files/[...slug]').default`,
      },
      {
        route: '/api/**',
        method: 'default',
        handlerType: `typeof import('../../server/api/[...]').default`,
      },
    ])
  })

  it('skips middleware and a dev handler, which carries a function, not a path', () => {
    const entries: HandlerEntry[] = [
      { route: '', handler: '/app/server/middleware/auth.ts' },
      { handler: '/app/server/middleware/log.ts' },
      { route: '/api/live', handler: eventHandler(() => null) },
      {
        route: '/api/real',
        method: 'get',
        handler: '/app/server/api/real.get.ts',
      },
    ]

    expect(routeHandlersOf(entries, NITRO).map(({ route }) => route)).toEqual([
      '/api/real',
    ])
  })
})

describe('method keys', () => {
  it('files a handler naming no method under `default`', () => {
    expect(
      routeHandlersOf(
        [{ route: '/api/y', handler: '/app/server/api/y.ts' }],
        NITRO
      )[0]?.method
    ).toBe('default')
  })

  it('files an empty method under `default`, as Nitro’s `||` does', () => {
    expect(
      routeHandlersOf(
        [
          {
            route: '/api/blank',
            method: '',
            handler: '/app/server/api/blank.ts',
          },
        ],
        NITRO
      )[0]?.method
    ).toBe('default')
  })

  it('lowercases a method a module passed through as it was', () => {
    // The filesystem scanner writes lowercase; `addServerHandler` forwards a
    // module's `'POST'`, and the lookup side reads `Lowercase<M>`.
    expect(
      routeHandlersOf(
        [{ route: '/api/p', method: 'POST', handler: '/app/server/api/p.ts' }],
        NITRO
      )[0]?.method
    ).toBe('post')
  })
})

describe('handler specifiers, relative to the map', () => {
  it('walks out of the types directory to a nested route file', () => {
    expect(specifierFor('/app/server/api/users/[id].get.ts')).toBe(
      '../../server/api/users/[id].get'
    )
  })

  it('reaches a handler outside the app root, as a layer’s is', () => {
    expect(
      specifierFor('/workspace/layers/base/server/api/shared.get.ts')
    ).toBe('../../../workspace/layers/base/server/api/shared.get')
  })

  it('forces `./` on a sibling of the map, which would otherwise be a package name', () => {
    expect(specifierFor('/app/.nuxt/types/generated.get.ts')).toBe(
      './generated.get'
    )
    expect(specifierFor('/app/.nuxt/types/.generated/route.get.ts')).toBe(
      './.generated/route.get'
    )
  })

  it('leaves a path on another Windows drive absolute', () => {
    const specifier = specifierFor('D:\\layers\\server\\api\\far.get.ts', {
      buildDir: 'C:\\app\\.nuxt',
      srcDir: 'C:\\app\\server',
      alias: {},
    })

    expect(specifier).toBe('D:/layers/server/api/far.get')
  })

  it('writes POSIX separators for a Windows path', () => {
    expect(
      specifierFor('C:\\app\\server\\api\\win.get.ts', {
        buildDir: 'C:\\app\\.nuxt',
        srcDir: 'C:\\app\\server',
        alias: {},
      })
    ).toBe('../../server/api/win.get')
  })

  it('expands a `{{ }}` template from Nitro’s options, as Nitro does', () => {
    expect(specifierFor('{{ buildDir }}/types/generated.get.ts')).toBe(
      './generated.get'
    )
  })

  it('resolves Nitro’s aliases and a bare path as Nitro’s own resolver does', () => {
    expect(specifierFor('~/server/api/aliased.get.ts')).toBe(
      '../../server/api/aliased.get'
    )
    expect(specifierFor('api/loose.get.ts')).toBe('../../server/api/loose.get')
  })

  it('strips exactly the extensions Nitro strips, and only at the end', () => {
    for (const extension of [
      'js',
      'mjs',
      'cjs',
      'ts',
      'mts',
      'cts',
      'tsx',
      'jsx',
    ]) {
      expect(specifierFor(`/app/server/api/r.get.${extension}`)).toBe(
        '../../server/api/r.get'
      )
    }

    expect(specifierFor('/app/server/api/v1.2/r.get.ts')).toBe(
      '../../server/api/v1.2/r.get'
    )
  })

  it('escapes a quote in a path rather than ending the literal', () => {
    const [found] = routeHandlersOf(
      [{ route: `/it's`, handler: `/app/server/routes/it's.ts` }],
      NITRO
    )

    expect(found?.handlerType).toBe(
      `typeof import('../../server/routes/it\\'s').default`
    )
  })
})
