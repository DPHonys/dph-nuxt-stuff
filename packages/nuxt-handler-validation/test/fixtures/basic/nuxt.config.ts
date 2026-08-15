import NuxtModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [NuxtModule],
  handlerValidation: {
    message: 'Configured by the Nuxt Handler Validation test fixture',
  },
})
