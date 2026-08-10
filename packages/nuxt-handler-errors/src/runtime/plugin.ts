import { defineNuxtPlugin, useRuntimeConfig } from '#app'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const starter = config.public.handlerErrors as {
    message: string
  }

  // TODO: Replace this Starter injection with package-specific runtime behavior.
  return {
    provide: {
      handlerErrors: { message: starter.message },
    },
  }
})
