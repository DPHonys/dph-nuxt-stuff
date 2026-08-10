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

import { defineNuxtPlugin, useRuntimeConfig } from '#app'
import { readChannelToken, setChannelToken } from '../../shared/channel'
import { $checkedFetch } from '../../shared/checked-fetch'

export default defineNuxtPlugin(() => {
  // The plugin is also where the channel tag enters this bundle: the global is
  // built at import time and `runtimeConfig` is only readable from here.
  setChannelToken(readChannelToken(useRuntimeConfig()))

  globalThis.$checkedFetch = $checkedFetch
})
