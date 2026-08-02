<script setup lang="ts">
const { SCAFFOLD_RUNTIME_INJECTION_TOKEN } = useNuxtApp()
</script>

<template>
  <main>
    <h1>SCAFFOLD_DISPLAY_NAME_TOKEN</h1>
    <p>{{ SCAFFOLD_RUNTIME_INJECTION_TOKEN.message }}</p>
  </main>
</template>
