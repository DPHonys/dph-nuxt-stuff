export default defineNuxtConfig({
  modules: ['@dphonys/nuxt-handler-validation'],
  devtools: { enabled: true },
  compatibilityDate: 'latest',
  // Written here on purpose: it is one of the four config forms the closed
  // `ModuleOptions` typing has to keep working, and this file is where a
  // consumer writes it. The other three sit in `module-options.check.ts`.
  handlerValidation: {},
})
