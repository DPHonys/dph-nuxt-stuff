import type { Nuxt, NuxtApp, NuxtTemplate } from '@nuxt/schema'

/** What Nuxt hands a template's `getContents`. */
export type TemplateData = Parameters<
  NonNullable<NuxtTemplate['getContents']>
>[0]

// An app with nothing resolved into it - what a booted, unbuilt Nuxt has.
function emptyApp(nuxt: Nuxt): NuxtApp {
  return {
    dir: nuxt.options.srcDir,
    extensions: nuxt.options.extensions,
    plugins: [],
    components: [],
    layouts: {},
    middleware: [],
    templates: [],
    configs: [],
  }
}

/** A render context over a booted Nuxt, for a template it registered. */
export function templateData(nuxt: Nuxt, template: NuxtTemplate): TemplateData {
  return { nuxt, app: emptyApp(nuxt), options: template.options ?? {} }
}
