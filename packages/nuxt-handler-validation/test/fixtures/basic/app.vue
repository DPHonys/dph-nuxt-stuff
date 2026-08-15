<script setup lang="ts">
import { useNuxtApp } from '#app'

const { $handlerValidation } = useNuxtApp()
</script>

<template>
  <p>{{ $handlerValidation.message }}</p>
</template>
