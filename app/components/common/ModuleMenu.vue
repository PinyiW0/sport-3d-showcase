<script setup lang="ts">
// 右上角的模組選單：漢堡鈕開一片面板，模組依「分析對象」分三組列出。
// 清單直接讀 registry，新增模組只要在 ModuleSpec 標 category 就會自己長出來。
import type { ModuleCategory } from '~/modules/types'
import LineSidebar from '~/components/common/LineSidebar.vue'
import { modules } from '~/modules/registry'
import { CATEGORY_LABEL } from '~/modules/types'

const route = useRoute()
const open = ref(false)

const groups = computed(() => {
  const order = Object.keys(CATEGORY_LABEL) as ModuleCategory[]
  return order
    .map(category => ({
      category,
      label: CATEGORY_LABEL[category],
      items: modules.filter(m => m.category === category),
    }))
    .filter(group => group.items.length > 0)
})

/** 目前停在哪個模組頁：該組把它標成選中，其餘組傳 null */
function activeIndexOf(items: { slug: string }[]): number | null {
  const index = items.findIndex(m => m.slug === route.params.slug)
  return index === -1 ? null : index
}

function go(category: ModuleCategory, index: number) {
  const group = groups.value.find(g => g.category === category)
  const target = group?.items[index]
  if (!target)
    return
  open.value = false
  navigateTo(`/modules/${target.slug}`)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape')
    open.value = false
}

// 面板打開時鎖住底層捲動，避免捲到一半背景跟著跑
watch(open, (isOpen) => {
  document.body.style.overflow = isOpen ? 'hidden' : ''
})

onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <div>
    <UButton
      icon="i-heroicons-bars-3"
      color="neutral"
      variant="ghost"
      size="lg"
      :ui="{ leadingIcon: 'size-7' }"
      class="fixed top-4 right-4 z-50"
      aria-label="開啟模組選單"
      :aria-expanded="open"
      @click="open = true"
    />

    <Teleport to="body">
      <Transition
        enter-active-class="transition-opacity duration-250 ease-standard"
        leave-active-class="transition-opacity duration-150 ease-standard"
        enter-from-class="opacity-0"
        leave-to-class="opacity-0"
      >
        <div
          v-if="open"
          class="fixed inset-0 z-50 bg-neutral-950/60"
          @click="open = false"
        />
      </Transition>

      <Transition
        enter-active-class="transition-transform duration-250 ease-emphasized"
        leave-active-class="transition-transform duration-150 ease-standard"
        enter-from-class="translate-x-full"
        leave-to-class="translate-x-full"
      >
        <nav
          v-if="open"
          aria-label="模組選單"
          class="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col overflow-y-auto border-l border-neutral-200 bg-white px-8 py-6 dark:border-neutral-800 dark:bg-neutral-950"
        >
          <div class="mb-8 flex items-center justify-between">
            <h2 class="text-lg font-semibold">
              模組
            </h2>
            <UButton
              icon="i-heroicons-x-mark"
              color="neutral"
              variant="ghost"
              size="lg"
              aria-label="關閉模組選單"
              @click="open = false"
            />
          </div>

          <div class="flex flex-col gap-10">
            <section v-for="group in groups" :key="group.category">
              <h3 class="mb-2 text-xs font-semibold tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                {{ group.label }}
              </h3>
              <LineSidebar
                :items="group.items.map(m => m.title)"
                :default-active="activeIndexOf(group.items)"
                :marker-length="40"
                :proximity-radius="80"
                :max-shift="14"
                :item-gap="16"
                :font-size="1"
                @item-click="index => go(group.category, index)"
              />
            </section>
          </div>
        </nav>
      </Transition>
    </Teleport>
  </div>
</template>
