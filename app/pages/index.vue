<!-- visual-hierarchy: marketing
     這頁是展示站門面（hero + 3D 模型 + 卡片牆），不是資料密集的後台介面，
     依 creative-direction §3 吃行銷頁的 display 規則，hero 大標才解得開 text-5xl -->
<script setup lang="ts">
import type { ModuleSpec, ModuleStatus } from '~/modules/types'
import BaseballLoader from '~/components/common/BaseballLoader.vue'
import BorderGlow from '~/components/common/BorderGlow.vue'
import LightRays from '~/components/common/LightRays.vue'
import ModelViewer from '~/components/common/ModelViewer.vue'
import ShinyText from '~/components/common/ShinyText.vue'
import ShuffleText from '~/components/common/ShuffleText.vue'
import TargetCursor from '~/components/common/TargetCursor.vue'
import ThreadLines from '~/components/common/ThreadLines.vue'
import { modules } from '~/modules/registry'
import { SPORT_LABEL, STATUS_LABEL } from '~/modules/types'
// Sport-3D 模組展示索引。新增模組往 app/modules/registry.ts 補一筆 ModuleSpec 即可。
// 顯式 import：auto-import 會把 components/common/ 下的元件註冊成 CommonBorderGlow

// hero 的光只在深色主題掛：白光在白底上發不出來，淺色主題跑這個 WebGL context 是純浪費
const colorMode = useColorMode()

// 線束是實色線條，兩種主題都成立——深色底畫白線、淺色底畫深線
const threadColor = computed<[number, number, number]>(() =>
  colorMode.value === 'dark' ? [1, 1, 1] : [0.1, 0.1, 0.12],
)

// 標題洗牌跑完才交棒給掃光；兩者不能同時存在（見 template 註解）。兩行各自一個旗標
const brandShuffled = ref(false)
const subtitleShuffled = ref(false)

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

// Bento 錯落排版：尺寸看模組本身的份量，不看它排第幾張——
// 否則篩選一切換，同一個模組的大小就會跳動。空出來的洞交給 grid-flow-dense 補。
type CardSize = 'large' | 'wide' | 'small'

function cardSize(m: ModuleSpec): CardSize {
  if (!m.presentation)
    return 'small' // 規劃中，只有文字輪廓
  return m.status === 'done' ? 'large' : 'wide'
}

// span 一律從 sm: 起跳：手機是單欄，col-span-2 會逼 grid 長出隱式第二欄
// small 維持單格：拉成直立格雖然填得滿大卡側邊，但篩選到只剩「規劃中」時旁邊沒有大卡，
// 那點文字量撐不起兩倍高，會變成兩塊空盒子
const spanClass: Record<CardSize, string> = {
  large: 'sm:col-span-2 sm:row-span-2',
  wide: 'sm:col-span-2',
  small: '',
}

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
  <div>
    <!-- 從視窗右上角打下來的體積光。fixed 滿版而不是塞在 hero 裡——
         框在區塊內的話，光被裁在那個矩形內，邊界會看得一清二楚 -->
    <ClientOnly>
      <div v-if="colorMode.value === 'dark'" class="pointer-events-none fixed inset-0 -z-10">
        <LightRays
          rays-origin="top-right"
          rays-color="#ffffff"
          :rays-speed="0.8"
          :light-spread="0.6"
          :ray-length="1.6"
          :follow-mouse="true"
          :mouse-influence="0.12"
          :noise-amount="0.08"
          :distortion="0.04"
        />
      </div>

      <!-- 準星游標。吸附目標是狀態篩選那排與每張卡片 -->
      <TargetCursor target-selector=".cursor-target" />
    </ClientOnly>

    <!-- 放寬到 6xl：4 欄 bento 在 4xl 下每欄只剩約 200px，卡片內容會擠成一團 -->
    <main class="mx-auto max-w-6xl px-6 py-16">
      <header class="relative mb-12 grid items-center gap-8 py-6 lg:grid-cols-[1fr_20rem]">
        <!-- 線束背景。弧度直接在 shader 裡做，不用 CSS 旋轉——轉整個 canvas 只能改斜率，
             而且轉完會在畫面裡露出線條端點的切邊。w-screen 撐滿視窗寬，兩端才落在畫面外 -->
        <ClientOnly>
          <div class="pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2">
            <ThreadLines
              :color="threadColor"
              :amplitude="1"
              :distance="0.25"
              :curvature="1.1"
              :curve-center="0.78"
              :baseline="0.3"
              :enable-mouse-interaction="true"
            />
          </div>
        </ClientOnly>

        <!-- 兩個效果串接而非疊加：Shuffle 用 SplitText 把字拆成一堆 span，
             而 ShinyText 靠一整片 background-clip 漸層，拆開後漸層會逐字斷裂。
             洗牌跑完才換 ShinyText 接手持續掃光。兩行各自跑、各自交棒 -->
        <!-- pl 把標題往右推，別跟右邊的球隔一大片空白 -->
        <h1 class="hero-title flex flex-col items-start font-bold tracking-tight lg:pl-32">
          <ShuffleText
            v-if="!brandShuffled"
            tag="span"
            class="text-7xl"
            text="Sport-3D"
            shuffle-direction="right"
            :duration="0.4"
            :shuffle-times="2"
            :stagger="0.03"
            root-margin="0px"
            :trigger-on-hover="false"
            scramble-charset="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
            @shuffle-complete="brandShuffled = true"
          />
          <ShinyText
            v-else
            class="text-7xl"
            text="Sport-3D"
            color="var(--hero-shiny-base)"
            shine-color="var(--hero-shiny-shine)"
            :speed="3"
            :spread="100"
          />

          <ShuffleText
            v-if="!subtitleShuffled"
            tag="span"
            class="mt-[16px] ml-[100px] text-5xl"
            text="Module Showcase"
            shuffle-direction="right"
            :duration="0.4"
            :shuffle-times="2"
            :stagger="0.025"
            root-margin="0px"
            :trigger-on-hover="false"
            scramble-charset="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
            @shuffle-complete="subtitleShuffled = true"
          />
          <ShinyText
            v-else
            class="mt-[16px] ml-[100px] text-5xl"
            text="Module Showcase"
            color="var(--hero-shiny-base)"
            shine-color="var(--hero-shiny-shine)"
            :speed="3"
            :spread="100"
          />
        </h1>

        <!-- 外層維持格子尺寸（版面不動、模型還沒掛上時也先佔好位置）；
             內層的 canvas 往四周各溢出一圈，讓放大時的陰影有地方畫。
             canvas 底是透明的，多出來的範圍看不出邊界，
             往下只溢到 header 的 mb-12 之內，不會蓋住下面那排篩選鈕 -->
        <div class="relative h-64 w-full lg:h-80">
          <!-- environmentPreset 設 none：cientos 的 <Environment> 會去 CDN 抓 HDRI，
               首頁不該為了打光多一個外部資源；四盞燈對單一白球已經夠 -->
          <ClientOnly>
            <div class="absolute -inset-x-8 -top-8 -bottom-10">
              <ModelViewer
                url="/models/baseball_detail.glb"
                width="100%"
                height="100%"
                environment-preset="none"
                :show-screenshot-button="false"
                :auto-rotate="true"
                :auto-rotate-speed="0.3"
                :model-y-offset="0.06"
                :default-zoom="1.55"
                :min-zoom-distance="1.2"
                :max-zoom-distance="4"
                :ambient-intensity="0.6"
                :key-light-intensity="1.4"
              >
                <template #loader>
                  <BaseballLoader :size="52" :animation-duration="3200" label="載入模型" />
                </template>
              </ModelViewer>
            </div>
          </ClientOnly>
        </div>
      </header>

      <nav class="mb-6 flex flex-wrap gap-2" aria-label="模組狀態篩選">
        <button
          v-for="f in filters"
          :key="f.value"
          type="button"
          :aria-pressed="selected === f.value"
          class="cursor-target px-3 py-1 text-sm font-medium transition"
          :class="selected === f.value
            ? f.activeClass
            : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'"
          @click="selected = f.value"
        >
          {{ f.label }}
          <span class="ml-1 opacity-60 tabular-nums">{{ f.count }}</span>
        </button>
      </nav>

      <!-- auto-rows 固定列高，大卡才跨得出「兩列」的份量；手機單欄時回到自然高度 -->
      <section class="grid grid-flow-row-dense gap-5 sm:auto-rows-[12rem] sm:grid-cols-2 lg:grid-cols-4">
        <!-- BorderGlow 在外層負責游標感應的光暈邊框；內層 NuxtLink 維持原本的 hover 影片切換 -->
        <BorderGlow
          v-for="m in visibleModules"
          :key="m.slug"
          class="cursor-target"
          :class="spanClass[cardSize(m)]"
        >
          <NuxtLink
            :to="`/modules/${m.slug}`"
            class="group relative flex h-full flex-col overflow-hidden rounded-[inherit] p-5 transition-colors duration-250 hover:bg-neutral-900"
            @mouseenter="playPreview"
            @mouseleave="resetPreview"
          >
            <!-- 常態：縮圖 + 文字；hover 時整層淡出，讓下方的影片層接手。
               min-h-0 讓大卡的縮圖能靠 flex-1 吃掉剩餘高度而不撐破卡片 -->
            <div
              class="flex min-h-0 flex-1 flex-col"
              :class="m.presentation ? 'transition-opacity duration-250 group-hover:opacity-0' : ''"
            >
              <div class="mb-3 flex items-center justify-between">
                <span :class="statusClass[m.status]" class="px-2.5 py-0.5 text-xs font-medium">
                  {{ STATUS_LABEL[m.status] }}
                </span>
                <span class="text-xs text-neutral-400">
                  {{ SPORT_LABEL[m.sport] }}<template v-if="m.updated"> · {{ m.updated }}</template>
                </span>
              </div>

              <!-- 大格：縮圖鋪滿上半、文字落在下方 -->
              <template v-if="cardSize(m) === 'large'">
                <div class="min-h-0 flex-1 overflow-hidden bg-neutral-100 ring-1 ring-neutral-200 dark:bg-neutral-800 dark:ring-neutral-700">
                  <img
                    :src="`/previews/${m.slug}.jpg`"
                    :alt="`${m.title} 呈現縮圖`"
                    class="size-full object-cover"
                    loading="lazy"
                  >
                </div>
                <h2 class="mt-3 text-lg font-semibold group-hover:underline">
                  {{ m.title }}
                </h2>
                <p class="mt-1.5 line-clamp-2 text-sm text-neutral-500 dark:text-neutral-400">
                  {{ m.summary }}
                </p>
              </template>

              <!-- 寬格：縮圖在左的橫排。overflow-hidden 讓超出的說明被裁掉而不是壓到下方 tags -->
              <template v-else-if="cardSize(m) === 'wide'">
                <div class="flex min-h-0 flex-1 gap-3 overflow-hidden">
                  <!-- self-start 不可少：flex 預設 stretch 會把容器拉到與文字等高，aspect-ratio 就失效了 -->
                  <div class="aspect-16/10 w-24 shrink-0 self-start overflow-hidden bg-neutral-100 ring-1 ring-neutral-200 dark:bg-neutral-800 dark:ring-neutral-700">
                    <img
                      :src="`/previews/${m.slug}.jpg`"
                      :alt="`${m.title} 呈現縮圖`"
                      class="size-full object-cover"
                      loading="lazy"
                    >
                  </div>

                  <div class="min-w-0">
                    <h2 class="text-lg font-semibold group-hover:underline">
                      {{ m.title }}
                    </h2>
                    <p class="mt-1.5 line-clamp-2 text-sm text-neutral-500 dark:text-neutral-400">
                      {{ m.summary }}
                    </p>
                  </div>
                </div>

                <!-- 單行不換行：tags 換到第二行會把卡片內容擠出固定列高 -->
                <div class="mt-3 flex shrink-0 gap-1.5 overflow-hidden">
                  <span
                    v-for="tag in m.tags"
                    :key="tag"
                    class="shrink-0 bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                  >{{ tag }}</span>
                </div>
              </template>

              <!-- 小格：規劃中的模組沒有預覽可放，縮圖換成純文字才不會把標題擠成兩行。
                 一格的高度容不下 tags，省下的空間留給說明多兩行 -->
              <div v-else class="min-h-0 flex-1 overflow-hidden">
                <h2 class="text-lg font-semibold group-hover:underline">
                  {{ m.title }}
                </h2>
                <p class="mt-1.5 line-clamp-4 text-sm text-neutral-500 dark:text-neutral-400">
                  {{ m.summary }}
                </p>
              </div>
            </div>

            <!-- hover 層：影片鋪滿整張卡片（preload="none"，hover 才抓 webm）。
             object-cover 而非 contain——影片是 16:10、卡片較扁，contain 會留下左右空白，
             而各模組影片底色不一（軌跡圖與轉軸為黑底、其餘白底），單一背景色補不平。 -->
            <div
              v-if="m.presentation"
              class="pointer-events-none absolute inset-2 overflow-hidden opacity-0 transition-opacity duration-250 group-hover:opacity-100"
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
        </BorderGlow>
      </section>

      <p
        v-if="!visibleModules.length"
        class="border border-dashed border-neutral-300 py-12 text-center text-sm text-neutral-500 dark:border-neutral-700"
      >
        目前沒有「{{ STATUS_LABEL[selected as ModuleStatus] }}」的模組。
      </p>

      <footer class="mt-16 border-t border-neutral-200 pt-6 text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
        <p class="font-medium text-neutral-600 dark:text-neutral-300">
          新增一個模組
        </p>
        <p class="mt-1 leading-relaxed">
          於 <code class="bg-neutral-100 px-1 py-0.5 font-mono text-xs dark:bg-neutral-800">app/modules/registry.ts</code> 補一筆 <code class="bg-neutral-100 px-1 py-0.5 font-mono text-xs dark:bg-neutral-800">ModuleSpec</code>（planned 可先只填文字區塊）；要有互動呈現時，做一個呈現元件掛到該筆的 <code class="bg-neutral-100 px-1 py-0.5 font-mono text-xs dark:bg-neutral-800">presentation</code>。索引與 <code class="bg-neutral-100 px-1 py-0.5 font-mono text-xs dark:bg-neutral-800">/modules/[slug]</code> 展示頁會自動帶出。
        </p>
        <p class="mt-2 leading-relaxed">
          卡片上的 hover 預覽：讓該 slug 在 <code class="bg-neutral-100 px-1 py-0.5 font-mono text-xs dark:bg-neutral-800">/preview/[slug]</code> 渲染得出來，再跑 <code class="bg-neutral-100 px-1 py-0.5 font-mono text-xs dark:bg-neutral-800">npm run capture:previews</code> 錄成 webm 與 poster。
        </p>
      </footer>
    </main>
  </div>
</template>

<style scoped>
/*
 * 掃光配色：淺色底掃「暗」、深色底掃「亮」，兩邊都靠對比讓那道光看得出來。
 * 光暈（text-shadow）在這裡不能用——掃光字的 text-fill 是透明的，
 * text-shadow 會照字形畫出一份實心模糊影，看起來就是重影。
 */
.hero-title {
  --hero-shiny-base: #52525b; /* zinc-600 */
  --hero-shiny-shine: #18181b; /* zinc-900 */
}

:where(.dark) .hero-title {
  --hero-shiny-base: #a1a1aa; /* zinc-400 */
  --hero-shiny-shine: #ffffff;
}
</style>
