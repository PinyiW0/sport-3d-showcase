import { defineVitestConfig } from '@nuxt/test-utils/config'

// 單元 / composable 測試走 Nuxt 環境；E2E（test/e2e）由 Playwright 跑。
// app/components/**：研究模組的測試就住在模組資料夾內，整包 cp 走時測試一起帶走
// （測試即該模組座標慣例與數學的可執行規格，是交接的一部分）。
export default defineVitestConfig({
  test: {
    environment: 'nuxt',
    include: ['test/unit/**/*.{test,spec}.ts', 'app/components/**/*.{test,spec}.ts'],
  },
})
