// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  // GitHub Pages 是純靜態託管：github-pages preset 會補上 .nojekyll
  // （否則 _nuxt/ 這種底線開頭資料夾會被 Jekyll 吃掉）與 404.html SPA fallback。
  //
  // 站台掛在 /sport-3d/ 子路徑下，由 CI 的 NUXT_APP_BASE_URL 帶入——
  // app.baseURL 預設就讀這個環境變數，本機 dev 沒設就是根路徑。
  // public/ 靜態資源不吃 baseURL，要自己用 useAssetUrl() 接前綴。
  nitro: {
    preset: 'github-pages',
  },
  runtimeConfig: {
    public: {
      // 統一 API domain，可由 NUXT_PUBLIC_API_BASE 覆蓋
      apiBase: '/api',
      // 後端是否回 envelope（{ success, data, message, meta }）；預設 on，
      // useHttp 自動拆掉外層回傳裸 data。裸 schema 後端設 NUXT_PUBLIC_API_ENVELOPE=false 關閉。
      apiEnvelope: true,
    },
  },
  modules: ['@nuxt/ui', '@nuxt/eslint', '@pinia/nuxt', 'pinia-plugin-persistedstate/nuxt'],
  eslint: {
    config: {
      standalone: false,
    },
  },
  css: ['~/assets/css/main.css'],
  // Nuxt UI 配置
  ui: {
    theme: {
      colors: ['primary', 'secondary', 'info', 'success', 'warning', 'error', 'neutral'],
    },
  },
})
