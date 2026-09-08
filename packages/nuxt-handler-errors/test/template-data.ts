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

// A render context over a booted Nuxt, for a template it registered.
function templateData(nuxt: Nuxt, template: NuxtTemplate): TemplateData {
  return { nuxt, app: emptyApp(nuxt), options: template.options ?? {} }
}

/** Render the template `filename` a booted Nuxt registered; fails if it is missing. */
export async function renderTemplate(
  nuxt: Nuxt,
  filename: string
): Promise<string> {
  const template = nuxt.options.build.templates.find(
    (entry) => entry.filename === filename
  )

  if (template?.getContents === undefined) {
    throw new Error(`no renderable template named ${filename}`)
  }

  return template.getContents(templateData(nuxt, template))
}
