import NuxtModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [NuxtModule],
  handlerErrors: {
    message: 'Configured by the Nuxt Handler Errors test fixture',
  },
})
