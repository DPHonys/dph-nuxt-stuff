import { defineNitroPlugin } from 'nitropack/runtime'
import { installCheckedFetchGlobal } from '../../shared/checked-fetch'

export default defineNitroPlugin(installCheckedFetchGlobal)
