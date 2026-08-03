import { addPlugin, createResolver, defineNuxtModule } from '@nuxt/kit'

export interface ModuleOptions {
  message?: string
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-handler-errors',
    configKey: 'handlerErrors',
    compatibility: { nuxt: '>=4.0.0' },
  },
  defaults: {
    message: 'Hello from Nuxt Handler Errors',
  },
  setup(options, nuxt) {
    // TODO: Replace this Starter option and setup with package-specific behavior.
    nuxt.options.runtimeConfig.public.handlerErrors = {
      message: options.message ?? 'Hello from Nuxt Handler Errors',
    }

    const resolver = createResolver(import.meta.url)
    addPlugin(resolver.resolve('./runtime/plugin'))
  },
})
