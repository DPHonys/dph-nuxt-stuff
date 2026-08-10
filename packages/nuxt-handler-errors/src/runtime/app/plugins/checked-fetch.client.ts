/**
 * Installs `globalThis.$checkedFetch` in the **browser**.
 *
 * It is a global because vanilla `$fetch` is one: that is what makes it
 * callable from `<script setup>`, from a store and from a plain `.ts` module
 * with no import and no new entry point.
 *
 * Registered `client`-only, and `src/module.ts` is where that decision lives —
 * this file is the assignment.
 */

import { defineNuxtPlugin } from '#app'
import { $checkedFetch } from '../../shared/checked-fetch'

export default defineNuxtPlugin(() => {
  globalThis.$checkedFetch = $checkedFetch
})
