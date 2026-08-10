export default defineNuxtConfig({
  modules: ['@dphonys/nuxt-handler-errors'],
  devtools: { enabled: true },
  compatibilityDate: 'latest',
  runtimeConfig: {
    public: {
      handlerErrors: {
        // A channel tag, not a secret: it ships in the client bundle by
        // design and marks first-party intent. With it set, a response to a
        // request that does not carry it goes out with the marker stripped.
        channelToken: 'playground-channel',
      },
    },
  },
})
