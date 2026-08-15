import { addServerImports, createResolver, defineNuxtModule } from '@nuxt/kit'

/**
 * The module has **zero options**: nothing about a route's validation is
 * configured - it is declared, in the route.
 *
 * The type is closed on purpose. Nuxt generates a
 * `Partial<ModuleOptions> | false` entry in `NuxtConfig` for every module that
 * names a config key; an open empty type would swallow a stray key silently -
 * `handlerValidation: { channelToken: 'x' }`, the plausible mix-up with the
 * sibling package, being the case this exists to catch. `Record<string, never>`
 * makes every key's value type `undefined`, so the stray key is a compile
 * error while `{}` and the `false` off-switch both still type-check.
 *
 * It must sit on the `defineNuxtModule` generic below - Nuxt computes the
 * `NuxtConfig` entry from the module's own generic, not from this alias - and
 * it is exported as well so `@nuxt/module-builder` does not synthesize its own.
 */
export type ModuleOptions = Record<string, never>

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-handler-validation',
    // Not an empty formality: `@nuxt/kit` defaults a missing `configKey` to
    // `meta.name`, so omitting it would only rename the key to the hyphenated
    // module name. What the key buys is the `handlerValidation: false`
    // off-switch kit generates for free - it skips the module's setup
    // entirely - and camelCase parity with the sibling.
    configKey: 'handlerValidation',
    // The ceiling is the only guard against the h3 v2 / Nitro 3 line.
    compatibility: { nuxt: '>=4.5.1 <5.0.0' },
  },
  defaults: {},
  setup() {
    // The module's whole job. Both names `/server` exports land in the same
    // ambient position as `defineEventHandler`, and nowhere else: each reads an
    // h3 event, or an error raised while handling one.
    //
    // Named explicitly rather than through `addServerImportsDir`, mirroring the
    // sibling: a directory scan would auto-import whatever the runtime tree
    // happens to export, so adding an internal helper would silently widen a
    // consumer's ambient surface. The two names are taken from the `/server`
    // entry itself, which is the one file whose exports are the public runtime
    // surface - and auto-imports are not the only door to it: the `/server`
    // subpath is the explicit one, for Nitro plugins and tasks, tests, non-Nuxt
    // Nitro consumers, and apps that disable auto-imports.
    const serverEntry = createResolver(import.meta.url).resolve(
      './runtime/server/index'
    )

    addServerImports([
      { name: 'defineValidatedEventHandler', from: serverEntry },
      { name: 'recognizeValidationError', from: serverEntry },
    ])
  },
})
