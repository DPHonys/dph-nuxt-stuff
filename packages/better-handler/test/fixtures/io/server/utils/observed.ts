/** What the error hook recognised, in order - read back by `/api/observed`. */
export interface Observed {
  readonly tag: string | undefined
  readonly status: number | undefined
}

export const observed: Observed[] = []
