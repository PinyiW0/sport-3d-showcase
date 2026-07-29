<script setup lang="ts">
/**
 * 棒球載入指示：球的輪廓先被描出來，縫線浮現，接著彈跳兩下，整體同時緩慢自轉。
 *
 * 動畫節奏取自 epic-spinners 的 FulfillingBouncingCircleSpinner（填滿 → 彈跳 → 旋轉
 * 三層疊加、外圈反向縮放做對位），但沒有裝那個套件——只用得到一支 spinner，
 * 不值得為它多一個依賴，而且它的樣式是獨立 CSS 檔、漏 import 就會靜默看不見。
 *
 * 原版「border 逐邊補滿」換成球的輪廓沿圓周描出來（stroke-dashoffset），
 * 因為棒球是實心的，逐邊出現的方框感對不上。
 *
 * 純 CSS animation，所以 main.css 的 reduced-motion guard 直接管得到：
 * 偏好減少動態時停在第一幀，圖形與文字照常顯示。
 */

interface Props {
  /** 直徑（px） */
  size?: number
  /** 一輪動畫的毫秒數 */
  animationDuration?: number
  /** 球體輪廓色；預設跟隨文字色 */
  color?: string
  /** 縫線顏色 */
  seamColor?: string
  /** 球下方的說明文字；留空只顯示球 */
  label?: string
}

const props = withDefaults(defineProps<Props>(), {
  size: 60,
  animationDuration: 4000,
  color: 'currentColor',
  seamColor: '#dc2626',
  label: '',
})

// r=45 的圓周長，給 stroke-dasharray 用（讓輪廓可以「描出來」）
const CIRCUMFERENCE = 2 * Math.PI * 45

const style = computed(() => ({
  '--loader-size': `${props.size}px`,
  '--loader-duration': `${props.animationDuration}ms`,
  '--loader-color': props.color,
  '--loader-seam': props.seamColor,
  '--loader-circumference': `${CIRCUMFERENCE}`,
}))
</script>

<template>
  <div class="baseball-loader" :style="style">
    <div class="baseball-loader__spin">
      <!-- 外圈軌道：與球體反向縮放，兩者錯開才有彈跳的對位感 -->
      <span class="baseball-loader__orbit" />

      <svg
        class="baseball-loader__ball"
        viewBox="0 0 100 100"
        role="img"
        :aria-label="label || '載入中'"
      >
        <!-- 縫線先畫：SVG 後畫的蓋在上面，所以輪廓要排在縫線之後，
             縫線的端點才會被輪廓壓住、像是收在球面裡。
             端點距圓心 43（輪廓環帶是 42–48），加上縫線自己的線寬半徑仍在環帶內，
             不會戳出球外——原本的 y=13/87 距圓心 47.6，一加線寬就凸出去了 -->
        <path class="baseball-loader__seam" d="M20 19 Q 38 50 20 81" />
        <path class="baseball-loader__seam" d="M80 19 Q 62 50 80 81" />
        <circle class="baseball-loader__outline" cx="50" cy="50" r="45" />
      </svg>
    </div>

    <span v-if="label" class="mt-2 block text-xs text-neutral-500 dark:text-neutral-400">{{ label }}</span>
  </div>
</template>

<style scoped>
.baseball-loader {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
}

.baseball-loader__spin {
  position: relative;
  width: var(--loader-size);
  height: var(--loader-size);
  animation: baseball-rotate var(--loader-duration) ease infinite;
}

.baseball-loader__orbit {
  position: absolute;
  inset: 0;
  border: calc(var(--loader-size) * 0.03) solid var(--loader-seam);
  border-radius: 50%;
  opacity: 0.35;
  animation: baseball-orbit var(--loader-duration) ease infinite;
}

.baseball-loader__ball {
  width: 100%;
  height: 100%;
  animation: baseball-bounce var(--loader-duration) ease infinite;
}

/*
 * 輪廓從 12 點鐘方向開始描：dasharray 設成整圈長度，
 * offset 由整圈遞減到 0 就是「畫出來」。
 */
.baseball-loader__outline {
  fill: none;
  stroke: var(--loader-color);
  stroke-width: 6;
  stroke-linecap: round;
  stroke-dasharray: var(--loader-circumference);
  transform: rotate(-90deg);
  transform-origin: center;
  animation: baseball-draw var(--loader-duration) ease infinite;
}

/* dasharray 把連續曲線切成短段＝針腳；linecap round 讓每段兩頭是圓的 */
.baseball-loader__seam {
  fill: none;
  stroke: var(--loader-seam);
  stroke-width: 5;
  stroke-linecap: round;
  stroke-dasharray: 1 9;
  animation: baseball-seam var(--loader-duration) ease infinite;
}

@keyframes baseball-rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* 前半圈把輪廓描完，最後收回去接下一輪 */
@keyframes baseball-draw {
  0% {
    stroke-dashoffset: var(--loader-circumference);
  }
  50%,
  87.5% {
    stroke-dashoffset: 0;
  }
  100% {
    stroke-dashoffset: var(--loader-circumference);
  }
}

/* 縫線等輪廓快描完才浮現，順序才讀得出來 */
@keyframes baseball-seam {
  0%,
  33% {
    opacity: 0;
  }
  50%,
  87.5% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

/* 描完才開始彈，兩下 */
@keyframes baseball-bounce {
  0%,
  50% {
    transform: scale(1);
  }
  62.5% {
    transform: scale(1.4);
  }
  75% {
    transform: scale(1);
  }
  87.5% {
    transform: scale(1.4);
  }
  100% {
    transform: scale(1);
  }
}

/* 外圈與球體反向：球脹的時候圈縮 */
@keyframes baseball-orbit {
  0%,
  50%,
  75%,
  100% {
    transform: scale(1);
  }
  62.5%,
  87.5% {
    transform: scale(0.8);
  }
}
</style>
