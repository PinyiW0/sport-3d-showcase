# sport-3d

運動科技 3D 前端研究 — 在 Nuxt 4 上探索棒球軌跡、轉軸（spin axis）等 3D 視覺化。承接 [`Nuxt4-template-SDD`](https://github.com/PinyiW0/Nuxt4-template-SDD) 的底座（NuxtUI + TS strict + 框架 skills + AI ops），**SDD 流程降為 opt-in**：skills 全留、不強制規格先行，適合探索性研究。

## 實驗清單

首頁（`/`）是實驗 gallery，新增實驗往 `app/pages/index.vue` 的 `experiments` 陣列補一筆即可。

| 實驗 | 路由 | 狀態 | 說明 |
|------|------|------|------|
| 棒球轉軸視覺化 | `/spin-demo` | 已完成 | 可依指定轉軸與轉速旋轉的 3D 棒球（Three.js），轉軸視覺化功能的技術基礎 |

- 元件與核心邏輯：[`app/components/baseball-spin/`](app/components/baseball-spin/)（`README.md` 說明用法）
- 研究筆記（選型決定、模型來源、轉軸參數定義）：[`docs/3d棒球旋轉視覺化研究筆記.md`](docs/3d棒球旋轉視覺化研究筆記.md)
- 單元測試（轉軸數學、模型正規化）：`test/unit/baseball-spin/`

## 技術棧

- **Nuxt 4**（SSR + Composition API）+ **NuxtUI**（Tailwind v4）
- **Three.js** — 3D 渲染（轉軸研究結論採 raw three.js，選型理由見研究筆記）
- **Vitest** 單元測試、**Playwright** E2E（研究階段未強制）
- **TypeScript strict**、ESLint（@antfu）+ Prettier

## 開發指令

```bash
npm install
npm run dev            # http://localhost:3000
npm run eslint         # ESLint + visual-hierarchy 檢查
npm run typelint       # 型別檢查（nuxi typecheck）
npm run test:unit      # Vitest 單元測試
```

## SDD 為 opt-in

模板的 SDD 指令（`/feature-to-flow`、`/feature-to-api`、`/feature-to-ui`、`/test e2e`…）與 AI ops 制度都保留在 `.claude/`，但研究階段**不強制**。`spec/`、`test/e2e/` 留空＝零摩擦；哪個原型成熟到要規格驅動，再對它單獨跑 SDD 流程即可。

## 與模板同步

需要撈回模板底座的改良時：

```bash
git remote add upstream git@github.com:PinyiW0/Nuxt4-template-SDD.git
git fetch upstream && git merge upstream/main   # 衝突多半落在 .claude/、config、deps
```

> 備註：本 repo 內容涉及 internal 棒球研究題材，目前為個人 private；如需納入公司權限管理可用 GitHub transfer 移至 `internal` org。
