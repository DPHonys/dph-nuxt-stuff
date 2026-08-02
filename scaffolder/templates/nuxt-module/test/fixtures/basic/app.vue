<script setup lang="ts">
const { SCAFFOLD_RUNTIME_INJECTION_TOKEN } = useNuxtApp()
</script>

<template>
  <p>{{ SCAFFOLD_RUNTIME_INJECTION_TOKEN.message }}</p>
</template>
