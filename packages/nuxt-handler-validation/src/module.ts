import { addServerImports, createResolver, defineNuxtModule } from '@nuxt/kit'

/**
 * The module has zero options. `Record<string, never>` rather than an open
 * empty type, so a stray key in `handlerValidation` is a compile error while
 * `{}` and the `false` off-switch still type-check.
 */
export type ModuleOptions = Record<string, never>

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-handler-validation',
    configKey: 'handlerValidation',
    // The ceiling is the only guard against the h3 v2 / Nitro 3 line.
    compatibility: { nuxt: '>=4.5.1 <5.0.0' },
  },
  defaults: {},
  setup() {
    // Named explicitly rather than through `addServerImportsDir`, whose scan
    // would auto-import whatever the runtime tree happens to export.
    const serverEntry = createResolver(import.meta.url).resolve(
      './runtime/server/index'
    )

    addServerImports([
      { name: 'defineValidatedEventHandler', from: serverEntry },
      { name: 'recognizeValidationError', from: serverEntry },
    ])
  },
})
