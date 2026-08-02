import NuxtModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [NuxtModule],
  SCAFFOLD_CONFIG_KEY_TOKEN: {
    message: 'SCAFFOLD_FIXTURE_MESSAGE_TOKEN',
  },
})
