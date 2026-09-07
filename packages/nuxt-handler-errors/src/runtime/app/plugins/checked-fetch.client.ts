import { defineNuxtPlugin } from '#app'
import { installCheckedFetchGlobal } from '../../shared/checked-fetch'

export default defineNuxtPlugin(installCheckedFetchGlobal)
