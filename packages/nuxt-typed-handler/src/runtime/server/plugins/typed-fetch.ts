import { defineNitroPlugin } from 'nitropack/runtime'
import { installTypedFetchGlobal } from '../../shared/typed-fetch'

export default defineNitroPlugin(installTypedFetchGlobal)
