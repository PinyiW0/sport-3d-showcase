# pitch-pose-plotly — 骨架的 Plotly 對照版

> 遷移到 Three.js 之前的實作，保留供並列比對。
> **要搬這一版**：整包 cp 這個資料夾 + `pitch-pose-data/` + `app/types/plotly.d.ts`。
> **不需要** `scene3d/`（那是 Three.js 版的場景基礎設施）。

props 介面與 `pitch-pose/Pose3dSkeleton.vue`（Three.js 版）完全相同，可直接互換：
`frames` / `timeMs` / `height` / `color` / `dark`。

## 檔案

| 檔案 | 責任 |
|------|------|
| `Pose3dSkeleton.vue` | Vue 薄殼：dynamic import plotly、拖曳防抖、視角保留 |
| `core/plotlyFigure.ts` | traces 與 layout 建構（純函式，無 DOM） |

軸範圍取自 `pitch-pose-data` 的 `computeSkeletonBounds()`，與 Three.js 版同一份計算。

## 依賴

`plotly.js-dist-min`（4.85MB raw，約 1.1MB gzip，無法 tree-shake）。
型別靠手寫 shim `app/types/plotly.d.ts`——套件本身沒附型別。

## 為什麼遷移到 Three.js

這一版有幾項在 Plotly 模型下解不掉的問題，留著是為了讓人親眼比對差異：

| 問題 | 位置 |
|------|------|
| 保住視角得讀**私有內部結構** `gd._fullLayout.scene._scene.getCamera()`，升級即碎且無型別保護 | `Pose3dSkeleton.vue` 的 `liveCamera()` |
| 播放中每秒 60 次 `plotly.react()` 會打斷 gl3d 拖曳手勢，只能在按住期間**暫停重繪**（骨架因此定格） | `interacting` / `renderPending` |
| 需要一條**隱形 anchor trace** 釘住 bounding box 才擋得住自動縮放 | `core/plotlyFigure.ts` 的 `buildTraces()` 第一條 |
| 空間等比得靠 `aspectratio` 人工換算「每 200cm = 1 視覺單位」再鎖 `aspectmode: 'manual'` | `core/plotlyFigure.ts` 的 `computeAspect()` |

病根是 Plotly 屬於「宣告式重畫整張圖」模型，60fps 逐幀動畫不是它的設計場景。
Three.js 版四項都不需要（OrbitControls 與資料更新天生解耦、世界單位直接是 cm）。

反過來說，Plotly 版免費附帶的東西，Three.js 版是自己畫的：三軸帶刻度數字的盒子
與 hover 顯示關節名稱，都在 `scene3d/core/{axisBox,hoverLabel}.ts`。
