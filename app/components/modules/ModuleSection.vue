<script setup lang="ts">
// 模組展示頁的單一區塊容器：標題列 + 內容 slot。
defineProps<{
  title: string
  icon?: string
  /** 選填區塊（如參考資料）會標「選填」 */
  optional?: boolean
}>()
</script>

<template>
  <section class="rounded-xl border border-neutral-200 dark:border-neutral-800">
    <header class="flex items-center gap-2 border-b border-neutral-100 px-5 py-3 dark:border-neutral-800/70">
      <UIcon v-if="icon" :name="icon" class="size-5 text-neutral-400" />
      <h2 class="text-base font-semibold">
        {{ title }}
      </h2>
      <UBadge v-if="optional" color="neutral" variant="subtle" size="sm">
        選填
      </UBadge>
    </header>
    <div class="px-5 py-4">
      <slot />
    </div>
  </section>
</template>
