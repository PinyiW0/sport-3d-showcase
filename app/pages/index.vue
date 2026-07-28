<script setup lang="ts">
import type { ModuleStatus } from '~/modules/types'
// Sport-3D 模組展示索引。新增模組往 app/modules/registry.ts 補一筆 ModuleSpec 即可。
import { modules } from '~/modules/registry'
import { SPORT_LABEL, STATUS_LABEL } from '~/modules/types'

const statusClass: Record<ModuleStatus, string> = {
  done: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  wip: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  planned: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
}

// 狀態篩選：選中的鈕沿用卡片標籤配色，一眼對得起來
type StatusFilter = ModuleStatus | 'all'

const selected = ref<StatusFilter>('all')

const filters = computed(() =>
  (['all', 'done', 'wip', 'planned'] as const).map(value => ({
    value,
    label: value === 'all' ? '全部' : STATUS_LABEL[value],
    count: value === 'all' ? modules.length : modules.filter(m => m.status === value).length,
    activeClass: value === 'all'
      ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
      : statusClass[value],
  })),
)

const visibleModules = computed(() =>
  selected.value === 'all' ? modules : modules.filter(m => m.status === selected.value),
)

// 預覽動畫由 scripts/capture-previews.mjs 產出，檔名對齊 slug。
// 有呈現元件的模組才錄得出東西；planned 模組顯示 placeholder。
// preload="none" — 首頁只載 poster，hover 才開始抓 webm。
function playPreview(event: MouseEvent) {
  const video = (event.currentTarget as HTMLElement).querySelector('video')
  video?.play().catch(() => {}) // 自動播放被瀏覽器擋下就維持 poster
}

function resetPreview(event: MouseEvent) {
  const video = (event.currentTarget as HTMLElement).querySelector('video')
  if (!video)
    return
  video.pause()
  video.currentTime = 0
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

    <div class="mb-6 flex flex-wrap gap-2">
      <button
        v-for="f in filters"
        :key="f.value"
        type="button"
        :aria-pressed="selected === f.value"
        class="rounded-full px-3 py-1 text-sm font-medium transition"
        :class="selected === f.value
          ? f.activeClass
          : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'"
        @click="selected = f.value"
      >
        {{ f.label }}
        <span class="ml-1 opacity-60 tabular-nums">{{ f.count }}</span>
      </button>
    </div>

    <section class="grid gap-5 sm:grid-cols-2">
      <NuxtLink
        v-for="m in visibleModules"
        :key="m.slug"
        :to="`/modules/${m.slug}`"
        class="group relative overflow-hidden rounded-xl border border-neutral-200 p-5 transition hover:border-neutral-300 hover:shadow-sm dark:border-neutral-800 dark:hover:border-neutral-700"
        @mouseenter="playPreview"
        @mouseleave="resetPreview"
      >
        <!-- 常態：縮圖 + 文字；hover 時整層淡出，讓下方的影片層接手 -->
        <div :class="m.presentation ? 'transition-opacity duration-250 group-hover:opacity-0' : ''">
          <div class="mb-3 flex items-center justify-between">
            <span :class="statusClass[m.status]" class="rounded-full px-2.5 py-0.5 text-xs font-medium">
              {{ STATUS_LABEL[m.status] }}
            </span>
            <span class="text-xs text-neutral-400">
              {{ SPORT_LABEL[m.sport] }}<template v-if="m.updated"> · {{ m.updated }}</template>
            </span>
          </div>
          <div class="flex gap-3">
            <!-- self-start 不可少：flex 預設 stretch 會把容器拉到與文字等高，aspect-ratio 就失效了 -->
            <div class="aspect-16/10 w-24 shrink-0 self-start overflow-hidden rounded-md bg-neutral-100 ring-1 ring-neutral-200 dark:bg-neutral-800 dark:ring-neutral-700">
              <img
                v-if="m.presentation"
                :src="`/previews/${m.slug}.jpg`"
                :alt="`${m.title} 呈現縮圖`"
                class="size-full object-cover"
                loading="lazy"
              >
              <div v-else class="flex size-full items-center justify-center text-neutral-400">
                <UIcon name="i-heroicons-wrench-screwdriver" class="size-4" />
              </div>
            </div>

            <div class="min-w-0">
              <h2 class="text-lg font-semibold group-hover:underline">
                {{ m.title }}
              </h2>
              <p class="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
                {{ m.summary }}
              </p>
            </div>
          </div>
          <div class="mt-3 flex flex-wrap gap-1.5">
            <span
              v-for="tag in m.tags"
              :key="tag"
              class="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
            >{{ tag }}</span>
          </div>
        </div>

        <!-- hover 層：影片鋪滿整張卡片（preload="none"，hover 才抓 webm）。
             object-cover 而非 contain——影片是 16:10、卡片較扁，contain 會留下左右空白，
             而各模組影片底色不一（軌跡圖與轉軸為黑底、其餘白底），單一背景色補不平。 -->
        <div
          v-if="m.presentation"
          class="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-250 group-hover:opacity-100"
        >
          <video
            :src="`/previews/${m.slug}.webm`"
            :poster="`/previews/${m.slug}.jpg`"
            :aria-label="`${m.title} 呈現預覽`"
            class="size-full object-cover"
            muted
            loop
            playsinline
            preload="none"
          />
        </div>
      </NuxtLink>
    </section>

    <p
      v-if="!visibleModules.length"
      class="rounded-xl border border-dashed border-neutral-300 py-12 text-center text-sm text-neutral-500 dark:border-neutral-700"
    >
      目前沒有「{{ STATUS_LABEL[selected as ModuleStatus] }}」的模組。
    </p>

    <footer class="mt-16 border-t border-neutral-200 pt-6 text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
      <p class="font-medium text-neutral-600 dark:text-neutral-300">
        新增一個模組
      </p>
      <p class="mt-1 leading-relaxed">
        於 <code class="rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs dark:bg-neutral-800">app/modules/registry.ts</code> 補一筆 <code class="rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs dark:bg-neutral-800">ModuleSpec</code>（planned 可先只填文字區塊）；要有互動呈現時，做一個呈現元件掛到該筆的 <code class="rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs dark:bg-neutral-800">presentation</code>。索引與 <code class="rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs dark:bg-neutral-800">/modules/[slug]</code> 展示頁會自動帶出。
      </p>
      <p class="mt-2 leading-relaxed">
        卡片上的 hover 預覽：讓該 slug 在 <code class="rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs dark:bg-neutral-800">/preview/[slug]</code> 渲染得出來，再跑 <code class="rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs dark:bg-neutral-800">npm run capture:previews</code> 錄成 webm 與 poster。
      </p>
    </footer>
  </main>
</template>
