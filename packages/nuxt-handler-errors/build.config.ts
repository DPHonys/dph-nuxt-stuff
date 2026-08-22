import { defineBuildConfig } from 'unbuild'

// `/internals/build` lives outside `src/runtime/`, so mkdist does not copy it;
// it is a second rollup entry beside `src/module`, merged onto the inline
// config `nuxt-module-build` hands unbuild. Runtime internals need nothing
// here - they ride the existing `src/runtime/` copy. Rollup hoists what both
// entries share (`emit-map`) into a `dist/shared/` chunk; `files: dist`
// ships it.
export default defineBuildConfig({
  entries: [{ input: 'src/internals/build', name: 'internals/build' }],
})
