<script setup lang="ts">
const { $handlerErrors } = useNuxtApp()
</script>

<template>
  <main>
    <h1>Nuxt Handler Errors</h1>
    <p>{{ $handlerErrors.message }}</p>
  </main>
</template>
