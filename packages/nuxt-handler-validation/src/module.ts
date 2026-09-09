import {
  addServerImports,
  addServerPlugin,
  createResolver,
  defineNuxtModule,
} from '@nuxt/kit'

export interface ModuleOptions {
  /**
   * Whether a development server asserts each response against the schema its
   * declared Response output promised for that status. A mismatch is a plain
   * `500` naming the route, the status and the issues; the assertion's result
   * is discarded, so development sends the bytes production sends.
   *
   * Defaults to `true`, and costs nothing in a production build, which never
   * runs the check at all. Set `false` for an app whose responses a schema
   * cannot describe.
   */
  checkResponses: boolean
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-handler-validation',
    configKey: 'handlerValidation',
    // The ceiling is the only guard against the h3 v2 / Nitro 3 line.
    compatibility: { nuxt: '>=4.5.1 <5.0.0' },
  },
  defaults: {
    checkResponses: true,
  },
  setup(options) {
    // Named explicitly rather than through `addServerImportsDir`, whose scan
    // would auto-import whatever the runtime tree happens to export.
    const resolver = createResolver(import.meta.url)
    const serverEntry = resolver.resolve('./runtime/server/index')

    addServerImports([
      { name: 'defineValidatedEventHandler', from: serverEntry },
      { name: 'recognizeValidationError', from: serverEntry },
    ])

    // Registered only to turn the check off: the option carries no value into
    // the bundle, so the plugin's presence is the whole of the setting.
    if (!options.checkResponses) {
      addServerPlugin(
        resolver.resolve('./runtime/server/plugins/response-check')
      )
    }
  },
})
