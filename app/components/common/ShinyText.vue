<script setup lang="ts">
/**
 * 掃光文字：一道亮色沿著文字橫向掃過。
 *
 * 效果同 Vue Bits 的 ShinyText，但改用純 CSS animation 實作——原版靠 motion-v
 * 用 rAF 逐幀寫 backgroundPosition，而這就是一個等速循環的背景位移，
 * CSS 做得完，不值得為它多一個動畫函式庫。
 *
 * 附帶好處：main.css 的 reduced-motion guard 管得到 CSS animation，
 * 不必像那幾個 WebGL 元件一樣自己偵測（減少動態時掃光停住，文字照常可讀）。
 *
 * 注意：這是 creative-direction §3「AI 模板味」清單點名的 gradient text，
 * 使用前先確認該處確實需要這個效果。
 */

interface Props {
  /** 要掃光的文字 */
  text: string
  /** 文字底色 */
  color?: string
  /** 掃過去的亮色 */
  shineColor?: string
  /** 一輪掃光的秒數 */
  speed?: number
  /** 漸層角度（度） */
  spread?: number
  /** 掃光方向 */
  direction?: 'left' | 'right'
  /** 來回掃而不是單向循環 */
  yoyo?: boolean
  /** 指標移上去時暫停 */
  pauseOnHover?: boolean
  /** 關掉效果，只留純色文字 */
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  color: '#b5b5b5',
  shineColor: '#ffffff',
  speed: 2,
  spread: 120,
  direction: 'left',
  yoyo: false,
  pauseOnHover: false,
  disabled: false,
})

const style = computed(() => ({
  '--shiny-color': props.color,
  '--shiny-shine': props.shineColor,
  '--shiny-spread': `${props.spread}deg`,
  '--shiny-speed': `${props.speed}s`,
}))
</script>

<template>
  <span
    class="shiny-text"
    :class="{
      'shiny-text--disabled': disabled,
      'shiny-text--reverse': direction === 'right',
      'shiny-text--yoyo': yoyo,
      'shiny-text--pause-on-hover': pauseOnHover,
    }"
    :style="style"
  >{{ text }}</span>
</template>

<style scoped>
/*
 * 漸層鋪成兩倍寬，再把背景位移動起來，亮色就會掃過字面。
 * background-position 動畫不在 creative-direction §4 的 transform/opacity 白名單內，
 * 但那條規則明訂 <style> 是責任轉移區——這裡沒有 layout 屬性被動到，不會觸發重排。
 */
.shiny-text {
  display: inline-block;
  background-image: linear-gradient(
    var(--shiny-spread),
    var(--shiny-color) 0%,
    var(--shiny-color) 35%,
    var(--shiny-shine) 50%,
    var(--shiny-color) 65%,
    var(--shiny-color) 100%
  );
  background-size: 200% auto;
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
  animation: shiny-sweep var(--shiny-speed) linear infinite;
}

.shiny-text--reverse {
  animation-direction: reverse;
}

.shiny-text--yoyo {
  animation-direction: alternate;
}

.shiny-text--yoyo.shiny-text--reverse {
  animation-direction: alternate-reverse;
}

.shiny-text--pause-on-hover:hover {
  animation-play-state: paused;
}

/* 關掉時退回純色文字，別留一個透明的字 */
.shiny-text--disabled {
  background-image: none;
  color: var(--shiny-color);
  -webkit-text-fill-color: var(--shiny-color);
  animation: none;
}

@keyframes shiny-sweep {
  from {
    background-position: 150% center;
  }
  to {
    background-position: -50% center;
  }
}
</style>
