<script setup lang="ts">
// 顯式 import：auto-import 會把 components/common/ 下的元件註冊成 CommonPitchProgress
import ModuleMenu from '~/components/common/ModuleMenu.vue'
import PitchProgress from '~/components/common/PitchProgress.vue'
</script>

<template>
  <UApp>
    <NuxtRouteAnnouncer />
    <!-- 換頁進度：一顆球沿投球弧線飛過頁面頂端 -->
    <PitchProgress />
    <!-- 模組選單：右上角常駐，每頁都跳得到別的模組 -->
    <ModuleMenu />
    <NuxtPage />
  </UApp>
</template>
