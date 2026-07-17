<script setup lang="ts">
import type { ModuleSpec } from '~/modules/types'
import { computed } from 'vue'
import ModuleSection from '~/components/modules/ModuleSection.vue'
import { SPORT_LABEL, STATUS_LABEL } from '~/modules/types'

// 模組展示頁範本：吃一個 ModuleSpec，渲染標題列 + 五個固定區塊
// （模組呈現／數據資料／使用技術／交接說明／參考資料）。
const props = defineProps<{ module: ModuleSpec }>()
const m = computed(() => props.module)
</script>

<template>
  <main class="mx-auto max-w-4xl space-y-8 px-6 py-12">
    <header class="space-y-3">
      <NuxtLink
        to="/"
        class="inline-flex items-center gap-1 text-sm text-neutral-500 transition hover:text-neutral-800 dark:hover:text-neutral-200"
      >
        <UIcon name="i-heroicons-arrow-left" class="size-4" />
        返回模組索引
      </NuxtLink>

      <div class="flex flex-wrap items-center gap-3">
        <h1 class="text-2xl font-bold tracking-tight">
          {{ m.title }}
        </h1>
        <UBadge :color="m.status === 'done' ? 'success' : 'neutral'" variant="subtle">
          {{ STATUS_LABEL[m.status] }}
        </UBadge>
        <UBadge color="info" variant="subtle">
          {{ SPORT_LABEL[m.sport] }}
        </UBadge>
      </div>

      <p class="text-neutral-600 dark:text-neutral-400">
        {{ m.summary }}
      </p>

      <div class="flex flex-wrap items-center gap-3">
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="tag in m.tags"
            :key="tag"
            class="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
          >{{ tag }}</span>
        </div>
        <UButton
          v-if="m.demoRoute"
          :to="m.demoRoute"
          size="sm"
          variant="outline"
          icon="i-heroicons-arrow-top-right-on-square"
          trailing
        >
          開啟獨立 demo
        </UButton>
      </div>
    </header>

    <!-- 1. 模組呈現 -->
    <ModuleSection title="模組呈現" icon="i-heroicons-cube-transparent">
      <component :is="m.presentation" v-if="m.presentation" />
      <div
        v-else
        class="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-300 py-16 text-center dark:border-neutral-700"
      >
        <UIcon name="i-heroicons-wrench-screwdriver" class="size-8 text-neutral-400" />
        <p class="text-sm text-neutral-500">
          呈現規劃中——預期以 {{ m.tech[0] ?? 'Three.js' }} 製作
        </p>
      </div>
    </ModuleSection>

    <!-- 2. 數據資料 -->
    <ModuleSection title="數據資料" icon="i-heroicons-circle-stack">
      <p class="text-sm text-neutral-700 dark:text-neutral-300">
        {{ m.data.summary }}
      </p>
      <dl v-if="m.data.format || m.data.sampleUrl" class="mt-3 space-y-1 text-sm">
        <div v-if="m.data.format" class="flex gap-2">
          <dt class="shrink-0 text-neutral-500">
            格式
          </dt>
          <dd class="font-mono text-xs">
            {{ m.data.format }}
          </dd>
        </div>
        <div v-if="m.data.sampleUrl" class="flex gap-2">
          <dt class="shrink-0 text-neutral-500">
            樣本
          </dt>
          <dd class="font-mono text-xs">
            {{ m.data.sampleUrl }}
          </dd>
        </div>
      </dl>
      <details v-if="m.data.sample" class="mt-3">
        <summary class="cursor-pointer text-sm text-neutral-500 transition hover:text-neutral-800 dark:hover:text-neutral-200">
          檢視樣本資料
        </summary>
        <pre class="mt-2 overflow-x-auto rounded-lg bg-neutral-900 p-4 text-xs leading-relaxed text-neutral-100"><code>{{ m.data.sample }}</code></pre>
      </details>
    </ModuleSection>

    <!-- 3. 使用技術 -->
    <ModuleSection title="使用技術" icon="i-heroicons-cpu-chip">
      <ul class="flex flex-wrap gap-2">
        <li
          v-for="t in m.tech"
          :key="t"
          class="rounded-md bg-neutral-100 px-2.5 py-1 text-sm dark:bg-neutral-800"
        >
          {{ t }}
        </li>
      </ul>
    </ModuleSection>

    <!-- 4. 交接說明 -->
    <ModuleSection title="交接說明" icon="i-heroicons-arrow-right-circle">
      <div class="space-y-4 text-sm">
        <div>
          <h3 class="mb-1.5 font-medium text-neutral-500">
            搬移檔案
          </h3>
          <ul class="space-y-1">
            <li
              v-for="f in m.handoff.files"
              :key="f"
              class="font-mono text-xs text-neutral-700 dark:text-neutral-300"
            >
              {{ f }}
            </li>
          </ul>
        </div>
        <div v-if="m.handoff.dependencies?.length">
          <h3 class="mb-1.5 font-medium text-neutral-500">
            依賴套件
          </h3>
          <ul class="flex flex-wrap gap-1.5">
            <li
              v-for="d in m.handoff.dependencies"
              :key="d"
              class="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs dark:bg-neutral-800"
            >
              {{ d }}
            </li>
          </ul>
        </div>
        <div>
          <h3 class="mb-1.5 font-medium text-neutral-500">
            可彈性微調
          </h3>
          <ul class="list-disc space-y-1 pl-4 text-neutral-700 dark:text-neutral-300">
            <li v-for="p in m.handoff.flexPoints" :key="p">
              {{ p }}
            </li>
          </ul>
        </div>
      </div>
    </ModuleSection>

    <!-- 5. 參考資料（選填） -->
    <ModuleSection v-if="m.references?.length" title="參考資料" icon="i-heroicons-book-open" optional>
      <ul class="space-y-1.5 text-sm">
        <li v-for="r in m.references" :key="r.label">
          <a
            v-if="r.href"
            :href="r.href"
            target="_blank"
            rel="noopener noreferrer"
            class="text-primary hover:underline"
          >{{ r.label }}</a>
          <span v-else class="font-mono text-xs text-neutral-600 dark:text-neutral-400">{{ r.label }}</span>
        </li>
      </ul>
    </ModuleSection>
  </main>
</template>
