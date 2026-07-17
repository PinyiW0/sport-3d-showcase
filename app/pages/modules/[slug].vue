<script setup lang="ts">
import ModulePage from '~/components/modules/ModulePage.vue'
import { findModule } from '~/modules/registry'

// 動態模組展示頁：以 slug 從 registry 取模組，找不到丟 404。
const route = useRoute()
const slug = computed(() => String(route.params.slug))
const mod = computed(() => findModule(slug.value))

if (!mod.value) {
  throw createError({
    statusCode: 404,
    statusMessage: `找不到模組：${slug.value}`,
    fatal: true,
  })
}

useHead({
  title: () => (mod.value ? `${mod.value.title}｜Sport-3D 模組` : 'Sport-3D 模組'),
})
</script>

<template>
  <ModulePage v-if="mod" :module="mod" />
</template>
