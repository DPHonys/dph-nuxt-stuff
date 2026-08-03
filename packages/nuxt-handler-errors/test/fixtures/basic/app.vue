<script setup lang="ts">
import { useNuxtApp } from '#app'

const { $handlerErrors } = useNuxtApp()
</script>

<template>
  <p>{{ $handlerErrors.message }}</p>
</template>
