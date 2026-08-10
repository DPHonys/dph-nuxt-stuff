import { observedFailures } from '~~/server/utils/observed-failures'

export default defineEventHandler(() => observedFailures)
