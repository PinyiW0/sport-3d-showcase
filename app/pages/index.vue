<script setup lang="ts">
import type { ModuleStatus } from '~/modules/types'
// Sport-3D 模組展示索引。新增模組往 app/modules/registry.ts 補一筆 ModuleSpec 即可。
import { modules } from '~/modules/registry'
import { SPORT_LABEL, STATUS_LABEL } from '~/modules/types'

const statusClass: Record<ModuleStatus, string> = {
  done: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  planned: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
}
</script>

<template>
  <main class="mx-auto max-w-4xl px-6 py-16">
    <header class="mb-12">
      <h1 class="text-3xl font-bold tracking-tight">
        Sport-3D 模組展示
      </h1>
      <p class="mt-2 text-neutral-500 dark:text-neutral-400">
        運動科技 3D 前端研究 — 每個模組一頁，看得到呈現效果、吃的資料與交接說明。
      </p>
    </header>

    <section class="grid gap-5 sm:grid-cols-2">
      <NuxtLink
        v-for="m in modules"
        :key="m.slug"
        :to="`/modules/${m.slug}`"
        class="group rounded-xl border border-neutral-200 p-5 transition hover:border-neutral-300 hover:shadow-sm dark:border-neutral-800 dark:hover:border-neutral-700"
      >
        <div class="mb-3 flex items-center justify-between">
          <span :class="statusClass[m.status]" class="rounded-full px-2.5 py-0.5 text-xs font-medium">
            {{ STATUS_LABEL[m.status] }}
          </span>
          <span class="text-xs text-neutral-400">
            {{ SPORT_LABEL[m.sport] }}<template v-if="m.updated"> · {{ m.updated }}</template>
          </span>
        </div>
        <h2 class="text-lg font-semibold group-hover:underline">
          {{ m.title }}
        </h2>
        <p class="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
          {{ m.summary }}
        </p>
        <div class="mt-3 flex flex-wrap gap-1.5">
          <span
            v-for="tag in m.tags"
            :key="tag"
            class="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
          >{{ tag }}</span>
        </div>
      </NuxtLink>
    </section>

    <footer class="mt-16 border-t border-neutral-200 pt-6 text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
      <p class="font-medium text-neutral-600 dark:text-neutral-300">
        新增一個模組
      </p>
      <p class="mt-1 leading-relaxed">
        於 <code class="rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs dark:bg-neutral-800">app/modules/registry.ts</code> 補一筆 <code class="rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs dark:bg-neutral-800">ModuleSpec</code>（planned 可先只填文字區塊）；要有互動呈現時，做一個呈現元件掛到該筆的 <code class="rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs dark:bg-neutral-800">presentation</code>。索引與 <code class="rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs dark:bg-neutral-800">/modules/[slug]</code> 展示頁會自動帶出。
      </p>
    </footer>
  </main>
</template>
