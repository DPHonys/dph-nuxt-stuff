/**
 * Hover targets for the harness's own self-test.
 *
 * A structural assertion is constitutionally blind to the regression class the
 * length budgets protect: the prototype's residue defect shipped while the
 * entire positive `Expect<Equal<…>>` suite was green, because the type is
 * structurally identical either way. Only a *rendering* assertion sees it.
 *
 * The concise and verbose declarations below are structurally unrelated on
 * purpose — they exist to be measured, and they are measured against the same
 * budget so that the self-test proves the budget can fail as well as pass.
 *
 * This fixture must also compile clean.
 */

/** Concise: what a flattened, legible declaration renders as. */
declare const _hoverConcise: { readonly tag: 'forbidden'; readonly status: 403 }

/**
 * Verbose: the same idea after the flattening mandate stops holding. Long
 * enough that the compiler's default 160-character truncation would cut it,
 * which is what makes it a test of `NoTruncation` and not only of length.
 */
declare const _hoverVerbose: {
  readonly tag: 'forbidden'
  readonly status: 403
  readonly requiredRole: 'admin' | 'owner' | 'billing' | 'support'
  readonly details: {
    readonly reason: string
    readonly at: string
    readonly hint: string | undefined
  }
  readonly meta: {
    readonly traceId: string
    readonly spanId: string
    readonly sampled: boolean
  }
}

/**
 * Resolves only through `ambient/harness-self-test.d.ts`, and mapped rather
 * than referenced so that it renders its shape instead of echoing the interface
 * name back. Rendering anything other than the real shape here means the
 * renderer was handed less than the whole program.
 */
declare const _hoverAmbient: {
  [K in keyof HarnessSelfTest.AmbientProbe]: HarnessSelfTest.AmbientProbe[K]
}

/**
 * The vacuous pass, on purpose: the renderer must refuse to report this rather
 * than hand back a two-character string that fits every budget ever written.
 */
declare const _hoverCollapsed: any
