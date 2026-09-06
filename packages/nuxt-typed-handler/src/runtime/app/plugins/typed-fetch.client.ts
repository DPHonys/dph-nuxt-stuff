import { defineNuxtPlugin } from '#app'
import { installTypedFetchGlobal } from '../../shared/typed-fetch'

export default defineNuxtPlugin(installTypedFetchGlobal)
