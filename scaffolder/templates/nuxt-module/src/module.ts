import { addPlugin, createResolver, defineNuxtModule } from '@nuxt/kit'

export interface ModuleOptions {
  message?: string
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-module-template',
    configKey: 'nuxtModuleTemplate',
    compatibility: { nuxt: '>=4.0.0' },
  },
  defaults: {
    message: 'SCAFFOLD_DEFAULT_MESSAGE_TOKEN',
  },
  setup(options, nuxt) {
    // TODO: Replace this Starter option and setup with package-specific behavior.
    nuxt.options.runtimeConfig.public.SCAFFOLD_CONFIG_KEY_TOKEN = {
      message: options.message,
    }

    const resolver = createResolver(import.meta.url)
    addPlugin(resolver.resolve('./runtime/plugin'))
  },
})
