# Nuxt 5

The package claims every Nuxt 4 (`>=4.0.0 <5.0.0`), and Nuxt 5 is a planned adapter, not a goal of this package yet. Nuxt 5 moves to h3 v2 and Nitro 3, and four mechanisms the package relies on change there. Each sits behind one function or module, and everything else in the package calls through it, so the adapter replaces four bodies and touches no caller.

| Seam                                  | Where                                                                                             | Nuxt 4 today                                                                                                  | Nuxt 5                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Route discovery for the generated map | `addRouteTypeTemplate` in `src/build/routes.ts`                                                   | Nitro's scanned handlers, re-emitted on its `types:extend` hook                                               | Nuxt's `server:routes` hook             |
| Response typing for the fetch family  | `src/runtime/types/engine.ts`                                                                     | `nitropack/types`: `InternalApi` through `TypedInternalResponse`, `Serialize`, `Simplify`, and their siblings | Nuxt's generated route engine           |
| Handler and error construction        | `makeEventHandler`, `httpError`, `toNuxtError`, `isNormalisedError` in `src/runtime/shared/h3.ts` | h3 v1's `defineEventHandler`, `createError` and `isError`                                                     | h3 v2's `defineHandler` and `HTTPError` |
| Nitro plugin registration             | `addRuntimeServerPlugin` in `src/build/server-plugins.ts`                                         | kit's `addServerPlugin`                                                                                       | kit's `addNitroPlugin` variants         |

Why these four:

- **Route discovery** is the only code that reads Nitro's handler list or hooks Nitro. The renderer it calls never sees Nitro, so the generated file is the same whichever way the routes arrive.
- **Response typing** is the only importer of `nitropack/types`, and the generated map names only `@dphonys/better-handler/types`, so the file survives the move to the generated engine unchanged. This is also where the [route ceiling](./request-typing.md#stack-depth-and-the-route-ceiling) lifts.
- **Handler and error construction** is the only file that builds an h3 handler or an h3 error, every Known error and developer fault included, and the only one that recognises an error h3 already made: the body read tells a parse refusal from a server fault through it, and the client classifier an error h3 already normalised.
- **Plugin registration** is the only call that hands Nitro a runtime plugin; the plugin files are plain default exports with no `nitropack/runtime` import.

Some things need no seam:

- **The error wire.** The Tagged error lives under `data`, which h3 v2's `HTTPError` keeps nested.
- **Names.** Nuxt 5 auto-imports every lowercase h3 v2 export, so the package uses none of those names, at its surface or inside the seams.

Outside the four seams, the remaining h3 v1 touchpoints are the source readers (`src/runtime/server/io/sources.ts`) and the response delivery's `setResponseStatus` and `send` (`src/runtime/server/io/respond.ts`), and `event.$betterFetch` wraps Nitro's experimental `event.$fetch`, which h3 v2 does not have; on a runtime without it the package rejects with an error naming the version skew. The native slot's request type is written against h3 v1's `EventHandlerRequest` and is the one type the adapter restates for h3 v2's event.

CI runs the suites against the Nuxt 4.0 floor and the latest 4.x. There is no Nuxt 5 job: the module claims Nuxt 4 only, so Nuxt 5 disables it, and the job would measure nothing.
