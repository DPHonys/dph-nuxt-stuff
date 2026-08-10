/**
 * A second deliberately-broken fixture, sitting in the same directory as the
 * first and failing with a *different* code.
 *
 * Its only job is to make the compile-alone mandate falsifiable: if the harness
 * ever compiled the directory as one program, this file's `TS2322` would show
 * up in the other fixture's diagnostics and vice versa, and every later
 * ticket's fixture would stop meaning what it says.
 */

export const isolationProbe: number = 'not a number'
