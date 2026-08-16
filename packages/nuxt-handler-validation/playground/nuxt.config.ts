export default defineNuxtConfig({
  modules: ['@dphonys/nuxt-handler-validation'],
  devtools: { enabled: true },
  compatibilityDate: 'latest',
  // The fourth config form; the other three sit in `module-options.check.ts`.
  handlerValidation: {},
})
