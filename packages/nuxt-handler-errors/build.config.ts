import { defineBuildConfig } from 'unbuild'

// `/internals/build` lives outside `src/runtime/`, so mkdist does not copy it:
// a second rollup entry beside `src/module`. What both share (`emit-map`)
// lands in a `dist/shared/` chunk, which `files: dist` ships.
export default defineBuildConfig({
  entries: [{ input: 'src/internals/build', name: 'internals/build' }],
})
