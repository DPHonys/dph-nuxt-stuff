import { defineNuxtPlugin, useRuntimeConfig } from '#app'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const starter = config.public.handlerValidation as {
    message: string
  }

  // TODO: Replace this Starter injection with package-specific runtime behavior.
  return {
    provide: {
      handlerValidation: { message: starter.message },
    },
  }
})
