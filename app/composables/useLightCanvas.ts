// 模組畫布的「淺色畫布」開關：打擊姿態、擊球點九宮格、預測落點球場圖三個模組共用。
//
// 預設跟著頁面 colorMode（整站目前固定深色），使用者切換只影響該模組的畫布，頁面其他部分不動。
// colorMode 在 SSR 讀不到使用者的系統偏好，在 onMounted 才同步，
// 避免 server／client 算出不同的畫布配色造成 hydration 不一致。

export function useLightCanvas() {
  const colorMode = useColorMode()
  const lightCanvas = ref(false)
  onMounted(() => {
    lightCanvas.value = colorMode.value === 'light'
  })
  watch(() => colorMode.value, (mode) => {
    lightCanvas.value = mode === 'light'
  })
  return lightCanvas
}
