/**
 * Installs `globalThis.$typedFetch` in the **browser**.
 *
 * `$typedFetch` is a global because vanilla `$fetch` is one: that is what makes
 * it callable from `<script setup>`, from a store and from a plain `.ts` module
 * with no import and no new entry point.
 *
 * Registered `client`-only, and `src/module.ts` is where that decision and the
 * rest of the reasoning live — this file is the assignment.
 */

import { defineNuxtPlugin } from '#app'
import { $typedFetch } from '../typed-fetch'

export default defineNuxtPlugin(() => {
  globalThis.$typedFetch = $typedFetch
})
