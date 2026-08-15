import type { ValidationIssue } from '@dphonys/nuxt-handler-validation-old/types'

/**
 * What the Nitro `error` hook was handed, in order - read back by
 * `/api/observed`. `ValidationIssue` comes from the type-only entry, which is
 * the door an app uses to name this package's payload without pulling server
 * code into a bundle.
 */
export interface ObservedError {
  statusCode: number | undefined
  message: string
  /** Whether `recognizeValidationError` recognized it. */
  recognized: boolean
  /** The issues it recognized, or `null` when it recognized nothing. */
  issues: ValidationIssue[] | null
}

export const observedErrors: ObservedError[] = []
