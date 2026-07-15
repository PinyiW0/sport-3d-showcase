<script setup lang="ts">
// Sport-3D 研究首頁：實驗清單。新增實驗時往 experiments 陣列補一筆即可。
interface Experiment {
  title: string
  desc: string
  to: string
  status: '進行中' | '已完成' | '暫停'
  tags: string[]
  updated: string
}

const experiments: Experiment[] = [
  {
    title: '棒球轉軸視覺化',
    desc: '在網頁上呈現一顆可依指定轉軸與轉速旋轉的 3D 棒球，作為轉軸（spin axis）視覺化功能的技術基礎。Three.js + Nuxt 4。',
    to: '/spin-demo',
    status: '已完成',
    tags: ['Three.js', 'spin-axis', 'glTF'],
    updated: '2026-07',
  },
]

const statusClass: Record<Experiment['status'], string> = {
  進行中: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  已完成: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  暫停: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-500/15 dark:text-neutral-300',
}
</script>

<template>
  <main class="mx-auto max-w-4xl px-6 py-16">
    <header class="mb-12">
      <h1 class="text-3xl font-bold tracking-tight">
        Sport-3D 研究
      </h1>
      <p class="mt-2 text-neutral-500 dark:text-neutral-400">
        運動科技 3D 前端研究 — 棒球軌跡與轉軸視覺化實驗集
      </p>
    </header>

    <section class="grid gap-5 sm:grid-cols-2">
      <NuxtLink
        v-for="exp in experiments"
        :key="exp.to"
        :to="exp.to"
        class="group rounded-xl border border-neutral-200 p-5 transition hover:border-neutral-300 hover:shadow-sm dark:border-neutral-800 dark:hover:border-neutral-700"
      >
        <div class="mb-3 flex items-center justify-between">
          <span :class="statusClass[exp.status]" class="rounded-full px-2.5 py-0.5 text-xs font-medium">
            {{ exp.status }}
          </span>
          <span class="text-xs text-neutral-400">{{ exp.updated }}</span>
        </div>
        <h2 class="text-lg font-semibold group-hover:underline">
          {{ exp.title }}
        </h2>
        <p class="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
          {{ exp.desc }}
        </p>
        <div class="mt-3 flex flex-wrap gap-1.5">
          <span
            v-for="tag in exp.tags"
            :key="tag"
            class="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
          >{{ tag }}</span>
        </div>
      </NuxtLink>
    </section>

    <footer class="mt-16 border-t border-neutral-200 pt-6 text-sm text-neutral-400 dark:border-neutral-800">
      承接 Nuxt4-template-SDD · SDD 降 opt-in（skills 保留、不強制規格流程）
    </footer>
  </main>
</template>
