/** What the `error` hook recognized, in order - read back by `/api/observed`. */
export interface ObservedFailure {
  tag: string
  status: number
  unhandled: boolean
}

export const observedFailures: ObservedFailure[] = []
