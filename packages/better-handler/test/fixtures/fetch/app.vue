<script setup lang="ts">
import type { NuxtError } from '#app'
import { isNuxtError, useAsyncData } from '#app'

// `$betterFetch` during server-side rendering, where the one global is
// Nitro's: a response and a classified failure, rendered.
const { data } = await useAsyncData('orders', async () => ({
  order: await $betterFetch('/api/orders/7'),
  missing: (await $betterFetch.try('/api/orders/404')).error,
}))

/** An error ref as the page reports it: what kind of error, and what it holds. */
function reported(error: NuxtError<unknown> | undefined) {
  return error === undefined
    ? null
    : {
        nuxtError: isNuxtError(error),
        statusCode: error.statusCode,
        body: error.data,
      }
}

// Read here, in setup, where the rendered request is known.
const requestFetch = useRequestBetterFetch()

// Every composable during server-side rendering. The two keyless
// `useBetterAsyncData` calls have no key unless the compiler appends one.
const order = await useBetterFetch('/api/orders/7')
const missing = await useBetterFetch('/api/orders/404')
const legacy = await useLazyBetterFetch('/legacy/404')
const tried = await useBetterAsyncData(() =>
  $betterFetch.try('/api/orders/404')
)
const triedOrder = await useBetterAsyncData(() =>
  $betterFetch.try('/api/orders/7')
)
const unavailable = await useLazyBetterAsyncData('unavailable', () =>
  requestFetch.try('/api/unavailable')
)
const echoed = await useBetterAsyncData('echoed', () =>
  requestFetch.try('/api/echo')
)
const fetchEchoed = await useBetterFetch('/api/echo')

/** What `console.warn` received while `calls` ran, which is synchronous. */
function warnedDuring(calls: () => void): string[] {
  const warned: string[] = []
  const warn = console.warn

  console.warn = (...args: unknown[]) => {
    warned.push(args.map(String).join(' '))
  }

  try {
    calls()
  } finally {
    console.warn = warn
  }

  return warned
}

// Nuxt's development check on a key two calls share hashes each call's
// handler from its source text: two different handlers under one key warn,
// the same handler twice does not. Only a development server runs it.
const shared = () => $betterFetch.try('/api/orders/7')
const collisions = {
  sameHandler: warnedDuring(() => {
    void useBetterAsyncData('same-handler', shared)
    void useBetterAsyncData('same-handler', shared)
  }),
  differentHandlers: warnedDuring(() => {
    void useBetterAsyncData('different-handlers', () =>
      $betterFetch.try('/api/orders/7')
    )
    void useBetterAsyncData('different-handlers', () =>
      $betterFetch.try('/api/orders/404')
    )
  }),
}

const composables = {
  useBetterFetch: {
    data: order.data.value,
    error: reported(missing.error.value),
    echoed: fetchEchoed.data.value,
  },
  useLazyBetterFetch: { error: reported(legacy.error.value) },
  useBetterAsyncData: {
    data: triedOrder.data.value,
    error: reported(tried.error.value),
    echoed: echoed.data.value,
  },
  useLazyBetterAsyncData: { error: reported(unavailable.error.value) },
}
</script>

<template>
  <pre id="rendered">{{ JSON.stringify(data) }}</pre>
  <pre id="composables">{{ JSON.stringify(composables) }}</pre>
  <pre id="collisions">{{ JSON.stringify(collisions) }}</pre>
</template>
