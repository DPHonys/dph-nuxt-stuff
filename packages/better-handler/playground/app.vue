<script setup lang="ts">
// The output-only route through the composable, typed from the generated map.
const { data: health } = await useBetterFetch('/api/health')
</script>

<template>
  <main>
    <h1>Better Handler</h1>
    <p>Server healthy: {{ health?.ok ?? false }}</p>
  </main>
</template>
