import { defineNuxtPlugin, useRuntimeConfig } from '#app'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const starter = config.public.SCAFFOLD_CONFIG_KEY_TOKEN

  // TODO: Replace this Starter injection with package-specific runtime behavior.
  return {
    provide: {
      SCAFFOLD_CONFIG_KEY_TOKEN: { message: starter.message },
    },
  }
})
