<script setup lang="ts">
import ModuleSection from '~/components/modules/ModuleSection.vue'

// 受保護內容的解鎖面板：訪客在此輸入共用密碼，解鎖後四個受保護區塊才會出現。
const store = useProtectedContentStore()

const password = ref('')
const revealed = ref(false)
const pending = computed(() => store.status === 'unlocking')

async function onSubmit() {
  const ok = await store.unlock(password.value)
  if (ok)
    password.value = ''
}

function toggleRevealed() {
  revealed.value = !revealed.value
}
</script>

<template>
  <ModuleSection title="登入後檢視" icon="i-heroicons-lock-closed">
    <div class="space-y-4">
      <div class="text-sm text-neutral-600 dark:text-neutral-400">
        <p>輸入密碼即可檢視以下區塊：</p>
        <ul class="mt-1.5 list-disc space-y-0.5 pl-4">
          <li>數據資料</li>
          <li>交接說明</li>
          <li>已知限制</li>
          <li>參考資料</li>
        </ul>
      </div>

      <form class="flex flex-wrap items-start gap-3" @submit.prevent="onSubmit">
        <input
          type="text"
          name="username"
          value="sport-3d"
          autocomplete="username"
          readonly
          class="hidden"
        >
        <UInput
          v-model="password"
          :type="revealed ? 'text' : 'password'"
          name="password"
          autocomplete="current-password"
          placeholder="請輸入密碼"
          :disabled="pending"
          :ui="{ trailing: 'pe-1' }"
        >
          <template #trailing>
            <UButton
              color="neutral"
              variant="link"
              size="sm"
              :icon="revealed ? 'i-heroicons-eye-slash' : 'i-heroicons-eye'"
              :aria-label="revealed ? '隱藏密碼' : '顯示密碼'"
              @click="toggleRevealed"
            />
          </template>
        </UInput>
        <UButton
          type="submit"
          size="md"
          :loading="pending"
          :disabled="!password || pending"
        >
          解鎖
        </UButton>
      </form>

      <UAlert
        v-if="store.error"
        color="error"
        variant="subtle"
        :title="store.error.message"
      />
    </div>
  </ModuleSection>
</template>
