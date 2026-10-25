<script setup lang="ts">
import { useAsyncData } from '#app'

// `$betterFetch` during server-side rendering, where the one global is
// Nitro's: a response and a classified failure, rendered.
const { data } = await useAsyncData('orders', async () => ({
  order: await $betterFetch('/api/orders/7'),
  missing: (await $betterFetch.try('/api/orders/404')).error,
}))
</script>

<template>
  <pre id="rendered">{{ JSON.stringify(data) }}</pre>
</template>
