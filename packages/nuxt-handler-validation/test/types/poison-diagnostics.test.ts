import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { compileFixture } from './compile-harness'

/**
 * What an author actually reads when they consume a poisoned source.
 *
 * The assertions next door prove a source resolved to a `CompositionError`;
 * only a compiler run proves the sentence it carries reaches the diagnostic,
 * which is the entire reason the poison is a named type rather than `never`.
 */

const resolve = (relative: string): string =>
  fileURLToPath(new URL(relative, import.meta.url))

const diagnostics = compileFixture(
  resolve('./tsconfig.fixtures.json'),
  resolve('./fixtures/poisoned-sources.ts')
)

/** TypeScript's "property does not exist on type X" - a poison's failure mode. */
const PROPERTY_DOES_NOT_EXIST = 2339

describe('consuming a poisoned source', () => {
  it.each([
    ['two different sets share one name on this source'],
    ['a set name collides with an unnamed schema output key on this source'],
    ['colliding unnamed schemas for one source must all output plain objects'],
    ['unnamed schemas composed beside named sets must output plain objects'],
    [
      'two unnamed sets contribute the same output key to one source — name one of them',
    ],
  ])('prints “%s”', (sentence) => {
    const printed = diagnostics.filter((diagnostic) =>
      diagnostic.message.includes(sentence)
    )

    // Named in the diagnostic, and named as the *type the access failed on* -
    // so an author reading it learns what they did rather than that something
    // does not exist.
    expect(printed).not.toEqual([])
    expect(printed.map((diagnostic) => diagnostic.code)).toContain(
      PROPERTY_DOES_NOT_EXIST
    )
  })

  it('fails at the property access, leaving the declaration itself legal', () => {
    // Every diagnostic in the fixture is a consumption failing, none of them a
    // declaration being rejected: the poison is a real type, so the route still
    // compiles until someone reads the value. One per poisoned handler, no
    // more - a sixth would mean something else in the fixture broke.
    expect(diagnostics).toHaveLength(5)
    expect(new Set(diagnostics.map((diagnostic) => diagnostic.code))).toEqual(
      new Set([PROPERTY_DOES_NOT_EXIST])
    )
  })
})
