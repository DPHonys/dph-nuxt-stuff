export default defineNuxtConfig({
  modules: ['@dphonys/nuxt-typed-handler'],
  devtools: { enabled: true },
  compatibilityDate: 'latest',
  typedHandler: {
    // A channel tag, not a secret: it is compiled into the client bundle by
    // design and marks first-party intent. With it set, a response to a
    // request that does not carry it goes out with the marker stripped.
    channelToken: 'playground-channel',
  },
})
