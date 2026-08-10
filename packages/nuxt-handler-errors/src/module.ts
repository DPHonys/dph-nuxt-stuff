import { addPlugin, createResolver, defineNuxtModule } from '@nuxt/kit'

export interface ModuleOptions {
  message?: string
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-handler-errors',
    configKey: 'handlerErrors',
    // Widening this later is a patch release; narrowing it is breaking, so it
    // starts tight: the floor is the lowest Nuxt the workspace catalog can
    // install, and the ceiling stops below a major nobody has run it on.
    // Move either end once you have measured it.
    compatibility: { nuxt: '>=4.5.1 <5.0.0' },
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
