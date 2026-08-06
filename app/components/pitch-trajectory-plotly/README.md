# pitch-trajectory-plotly — 軌跡圖的 Plotly 對照版

> 遷移到 Three.js 之前的實作，保留供並列比對。
> **要搬這一版**：整包 cp 這個資料夾 + `pitch-trajectory-data/` + `baseball-field/` +
> `app/types/plotly.d.ts`。**不需要** `scene3d/`（那是 Three.js 版的場景基礎設施）。

props 介面與 `pitch-trajectory/PitchTrajectoryChart.vue`（Three.js 版）完全相同，
可直接互換：`trajectory` / `batterHeightCm` / `width` / `height` / `zoom` / `cameraEye`。

## 檔案

| 檔案 | 責任 |
|------|------|
| `PitchTrajectoryChart.vue` | Vue 薄殼：dynamic import plotly、`plotly.react()` 渲染 |
| `core/plotlyFigure.ts` | traces 與 layout 建構（純函式，無 DOM），含 `.spec.ts` |

幾何與配色一律取自 `pitch-trajectory-data`，與 Three.js 版同一份計算。

## trace 組成

| Trace | 類型 | 內容 |
|-------|------|------|
| 軌跡線 | `scatter3d` lines+markers | 琥珀黃（#FFC107）線寬 2 |
| 出手點 | `scatter3d` markers | 軌跡首點，size 2 |
| 入壘點 | `scatter3d` markers | 軌跡末點，size 4 深紅（#A40C17） |
| 本壘板 | `mesh3d` | 灰色、flatshading |
| 九宮格 | `scatter3d` lines × 2 | 白色外框（寬 3）+ 內線（寬 1.5） |

## 依賴

`plotly.js-dist-min`（4.85MB raw，約 1.1MB gzip，無法 tree-shake）。
型別靠手寫 shim `app/types/plotly.d.ts`。

## 與 Three.js 版的差異

- **空間等比**：這一版要靠 `aspectratio` 人工換算「每 200cm = 1 視覺單位」再鎖
  `aspectmode: 'manual'`；Three.js 版的世界單位直接就是 cm，天生等比
- **marker 尺寸**：Plotly 的 marker 是螢幕空間（固定像素）；Three.js 版的出手／入壘點
  改用 world 單位球體（有 3D 縱深感），只有軌跡取樣點維持螢幕空間
- **軸盒與 legend**：Plotly 免費附三軸刻度盒與圖例；Three.js 版的軸盒是自繪的
  （`scene3d/core/axisBox.ts`），沒有圖例
