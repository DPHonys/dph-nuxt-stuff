interface NuxtModuleDefinition {
  meta: { name: string; configKey: string }
}

declare function defineNuxtModule(
  definition: NuxtModuleDefinition
): NuxtModuleDefinition

export default defineNuxtModule({
  meta: {
    name: 'test-template',
    configKey: 'testTemplate',
  },
})
