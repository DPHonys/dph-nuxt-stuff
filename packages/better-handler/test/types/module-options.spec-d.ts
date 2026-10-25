import { describe, expectTypeOf, it } from 'vitest'
import type { ModuleOptions } from '../../src/module'

describe('the module options', () => {
  it('are the single `devChecks` switch', () => {
    expectTypeOf<ModuleOptions>().toEqualTypeOf<{ devChecks: boolean }>()
  })

  it('refuse every key but `devChecks`, the retired channel token among them', () => {
    expectTypeOf<keyof ModuleOptions>().toEqualTypeOf<'devChecks'>()
  })
})
