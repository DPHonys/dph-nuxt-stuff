<script setup lang="ts">
import { DECLARED_ERROR_KEY } from '@dphonys/nuxt-handler-errors/shared'
import type { TypedApiErrors } from '@dphonys/nuxt-handler-errors/types'
import { SHARED_CONTEXT_PROBE } from '#shared/specifier-probe'

/** Context 1 of 3: the Vue client. `<script setup>` cannot export, so the
 * augmentation target is proven reachable through a local alias. */
type _ClientContextErrorMap = TypedApiErrors

const client = `client:${DECLARED_ERROR_KEY}`
const { data: server } = await useFetch('/api/specifier-probe')
</script>

<template>
  <main>
    <h1>Nuxt Handler Errors</h1>
    <p id="client-context">{{ client }}</p>
    <p id="shared-context">{{ SHARED_CONTEXT_PROBE }}</p>
    <p id="server-context">{{ server?.server }}</p>
  </main>
</template>
