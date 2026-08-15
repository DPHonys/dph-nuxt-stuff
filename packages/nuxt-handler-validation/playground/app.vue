<script setup lang="ts">
const { $handlerValidation } = useNuxtApp()
</script>

<template>
  <main>
    <h1>Nuxt Handler Validation</h1>
    <p>{{ $handlerValidation.message }}</p>
  </main>
</template>
