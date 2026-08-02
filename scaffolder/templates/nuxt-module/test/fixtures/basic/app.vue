<script setup lang="ts">
import { useNuxtApp } from '#app'

const { SCAFFOLD_RUNTIME_INJECTION_TOKEN } = useNuxtApp()
</script>

<template>
  <p>{{ SCAFFOLD_RUNTIME_INJECTION_TOKEN.message }}</p>
</template>
