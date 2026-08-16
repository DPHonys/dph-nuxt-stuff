import type { ValidationIssue } from '@dphonys/nuxt-handler-validation/types'

/** What the `error` hook was handed, in order - read back by `/api/observed`. */
export interface ObservedError {
  statusCode: number | undefined
  message: string
  recognized: boolean
  issues: ValidationIssue[] | null
}

export const observedErrors: ObservedError[] = []
